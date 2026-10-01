import { and, eq, inArray } from 'drizzle-orm';
import type { ImportConfirmation, ImportJob } from '@wawatube/shared';
import type { Database } from '../db/index.js';
import {
  categories,
  imports,
  mediaCategories,
  mediaItems,
  type ImportRow,
} from '../db/schema.js';
import { ApiFailure } from '../http/errors.js';
import type { MediaGateway } from '../media-gateway.js';
import { importDto } from '../library/service.js';
import { ProviderError } from '../providers/errors.js';

const EXTRACTION_TIMEOUT = 30 * 60_000;
export class ImportService {
  private running = false;
  private readonly queuedThisProcess = new Set<string>();
  constructor(
    private readonly db: Database,
    private readonly media: MediaGateway,
  ) {}

  async job(id: string): Promise<ImportRow> {
    const [row] = await this.db
      .select()
      .from(imports)
      .where(eq(imports.id, id))
      .limit(1);
    if (!row) throw new ApiFailure(404, 'IMPORT_NOT_FOUND');
    return row;
  }
  async start(sourceId: string): Promise<ImportJob> {
    const [existing] = await this.db
      .select()
      .from(imports)
      .where(
        and(eq(imports.sourceType, 'YOUTUBE'), eq(imports.sourceId, sourceId)),
      )
      .limit(1);
    if (existing) {
      if (existing.state === 'READY' && !existing.mediaItemId) {
        const [reset] = await this.db
          .update(imports)
          .set({
            state: 'PREVIEW',
            approved: false,
            errorCode: null,
            updatedAt: new Date(),
          })
          .where(eq(imports.id, existing.id))
          .returning();
        return importDto(reset!);
      }
      return importDto(existing);
    }
    const [created] = await this.db
      .insert(imports)
      .values({ sourceType: 'YOUTUBE', sourceId, state: 'EXTRACTING' })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [row] = await this.db
        .select()
        .from(imports)
        .where(
          and(
            eq(imports.sourceType, 'YOUTUBE'),
            eq(imports.sourceId, sourceId),
          ),
        )
        .limit(1);
      return importDto(row!);
    }
    return importDto(await this.extract(created));
  }
  private async extract(row: ImportRow): Promise<ImportRow> {
    try {
      const metadata = await this.media.previewYoutube(row.sourceId);
      if (!metadata) return row;
      const [updated] = await this.db
        .update(imports)
        .set({
          state: 'PREVIEW',
          title: metadata.title,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          thumbnailUrl: metadata.thumbnailRef,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(imports.id, row.id))
        .returning();
      return updated!;
    } catch (error) {
      const code =
        error instanceof ProviderError ? error.code : 'UPSTREAM_UNAVAILABLE';
      const [updated] = await this.db
        .update(imports)
        .set({ state: 'FAILED', errorCode: code, updatedAt: new Date() })
        .where(eq(imports.id, row.id))
        .returning();
      return updated!;
    }
  }
  async confirm(id: string, body: ImportConfirmation): Promise<ImportJob> {
    const row = await this.job(id);
    if (row.state === 'READY') return importDto(row);
    if (row.state !== 'PREVIEW' && row.state !== 'QUEUED')
      throw new ApiFailure(409, 'IMPORT_NOT_READY');
    const updated = await this.db.transaction(async (tx) => {
      if (new Set(body.categoryIds).size !== body.categoryIds.length)
        throw new ApiFailure(400, 'INVALID_CATEGORY_IDS');
      const found = body.categoryIds.length
        ? await tx
            .select({ id: categories.id })
            .from(categories)
            .where(inArray(categories.id, body.categoryIds))
        : [];
      if (found.length !== body.categoryIds.length)
        throw new ApiFailure(400, 'CATEGORY_NOT_FOUND');
      const [saved] = await tx
        .update(imports)
        .set({
          approved: true,
          requestedVisible: body.visible,
          requestedCategoryIds: body.categoryIds,
          state: 'QUEUED',
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(imports.id, id))
        .returning();
      return saved!;
    });
    await this.process(updated, true);
    return importDto(await this.job(id));
  }
  async retry(id: string): Promise<ImportJob> {
    const row = await this.job(id);
    if (row.state !== 'FAILED') throw new ApiFailure(409, 'IMPORT_NOT_FAILED');
    this.queuedThisProcess.delete(id);
    const state = row.approved ? 'QUEUED' : 'EXTRACTING';
    const [updated] = await this.db
      .update(imports)
      .set({ state, errorCode: null, updatedAt: new Date() })
      .where(eq(imports.id, id))
      .returning();
    if (!updated) throw new ApiFailure(404, 'IMPORT_NOT_FOUND');
    if (!row.approved) return importDto(await this.extract(updated));
    await this.process(updated, true);
    return importDto(await this.job(id));
  }
  async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.db
        .select()
        .from(imports)
        .where(
          and(
            eq(imports.sourceType, 'YOUTUBE'),
            inArray(imports.state, ['EXTRACTING', 'QUEUED']),
          ),
        );
      for (const row of rows) {
        try {
          await this.process(row);
        } catch (error) {
          console.error('import reconciliation failed', row.id, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
  private async process(row: ImportRow, dispatch = false): Promise<void> {
    if (row.state === 'EXTRACTING') {
      if (Date.now() - row.updatedAt.getTime() > EXTRACTION_TIMEOUT)
        await this.db
          .update(imports)
          .set({
            state: 'FAILED',
            errorCode: 'EXTRACTION_TIMEOUT',
            updatedAt: new Date(),
          })
          .where(eq(imports.id, row.id));
      else {
        const result = await this.media.reconcileYoutube(row.sourceId);
        if (result.metadata)
          await this.db
            .update(imports)
            .set({
              state: 'PREVIEW',
              title: result.metadata.title,
              description: result.metadata.description,
              durationSeconds: result.metadata.durationSeconds,
              thumbnailUrl: result.metadata.thumbnailRef,
              updatedAt: new Date(),
            })
            .where(eq(imports.id, row.id));
        else if (result.failed)
          await this.db
            .update(imports)
            .set({
              state: 'FAILED',
              errorCode: 'EXTRACTION_FAILED',
              updatedAt: new Date(),
            })
            .where(eq(imports.id, row.id));
      }
      return;
    }
    if (row.state !== 'QUEUED' || !row.approved) return;
    const result = await this.media.reconcileYoutube(row.sourceId);
    if (result.available && result.metadata) {
      await this.publish(row, result.metadata);
      return;
    }
    if (dispatch) {
      await this.dispatchQueue(row);
      return;
    }
    if (result.failed) {
      await this.db
        .update(imports)
        .set({
          state: 'FAILED',
          errorCode: 'DOWNLOAD_FAILED',
          updatedAt: new Date(),
        })
        .where(eq(imports.id, row.id));
      return;
    }
    await this.dispatchQueue(row);
  }
  private async dispatchQueue(row: ImportRow): Promise<void> {
    if (this.queuedThisProcess.has(row.id)) return;
    this.queuedThisProcess.add(row.id);
    try {
      await this.media.queueYoutube(row.sourceId);
    } catch (error) {
      this.queuedThisProcess.delete(row.id);
      await this.db
        .update(imports)
        .set({
          state: 'FAILED',
          errorCode:
            error instanceof ProviderError
              ? error.code
              : 'UPSTREAM_UNAVAILABLE',
          updatedAt: new Date(),
        })
        .where(eq(imports.id, row.id));
    }
  }
  private async publish(
    row: ImportRow,
    metadata: {
      title: string;
      description: string | null;
      durationSeconds: number | null;
      thumbnailRef: string | null;
    },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(imports)
        .where(eq(imports.id, row.id))
        .for('update')
        .limit(1);
      if (!current || current.state !== 'QUEUED' || !current.approved) return;
      const [item] = await tx
        .insert(mediaItems)
        .values({
          sourceType: 'YOUTUBE',
          sourceId: row.sourceId,
          title: metadata.title,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          thumbnailRef: metadata.thumbnailRef,
          visible: current.requestedVisible,
          availability: 'AVAILABLE',
        })
        .onConflictDoUpdate({
          target: [mediaItems.sourceType, mediaItems.sourceId],
          set: {
            title: metadata.title,
            description: metadata.description,
            durationSeconds: metadata.durationSeconds,
            thumbnailRef: metadata.thumbnailRef,
            visible: current.requestedVisible,
            availability: 'AVAILABLE',
            updatedAt: new Date(),
          },
        })
        .returning();
      const found = current.requestedCategoryIds.length
        ? await tx
            .select({ id: categories.id })
            .from(categories)
            .where(inArray(categories.id, current.requestedCategoryIds))
        : [];
      await tx
        .delete(mediaCategories)
        .where(eq(mediaCategories.mediaItemId, item!.id));
      if (found.length)
        await tx
          .insert(mediaCategories)
          .values(
            found.map(({ id }) => ({ mediaItemId: item!.id, categoryId: id })),
          );
      await tx
        .update(imports)
        .set({
          state: 'READY',
          mediaItemId: item!.id,
          title: metadata.title,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          thumbnailUrl: metadata.thumbnailRef,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(imports.id, row.id));
    });
    this.queuedThisProcess.delete(row.id);
  }
}
