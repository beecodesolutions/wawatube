import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { PlaylistImportJob } from '@wawatube/shared';
import type { Database } from '../db/index.js';
import {
  categories,
  playlistImports,
  type PlaylistImportRow,
} from '../db/schema.js';
import { ApiFailure } from '../http/errors.js';
import type { MediaGateway } from '../media-gateway.js';
import { ProviderError } from '../providers/errors.js';
import { ImportService } from './service.js';
import { playlistImportDto } from '../library/service.js';

const PLAYLIST_TIMEOUT = 30 * 60_000;
const MONITOR_INTERVAL = 60 * 60_000;

const playlistUrl = (playlistId: string): string =>
  `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;

export class PlaylistImportService {
  private running = false;
  private refreshRequested = false;

  constructor(
    private readonly db: Database,
    private readonly media: MediaGateway,
    private readonly imports: ImportService,
  ) {}

  async job(id: string): Promise<PlaylistImportRow> {
    const [row] = await this.db
      .select()
      .from(playlistImports)
      .where(eq(playlistImports.id, id))
      .limit(1);
    if (!row) throw new ApiFailure(404, 'PLAYLIST_IMPORT_NOT_FOUND');
    return row;
  }

  async start(
    playlistId: string,
    categoryId: string | undefined,
    visible: boolean,
    monitor: boolean,
  ): Promise<PlaylistImportJob> {
    if (categoryId) {
      const found = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, categoryId));
      if (!found.length) throw new ApiFailure(400, 'CATEGORY_NOT_FOUND');
    }
    const [existing] = await this.db
      .select()
      .from(playlistImports)
      .where(eq(playlistImports.playlistId, playlistId))
      .limit(1);
    if (existing) {
      if (existing.state === 'EXTRACTING') {
        if (
          existing.categoryId !== (categoryId ?? null) ||
          existing.visible !== visible
        )
          throw new ApiFailure(409, 'PLAYLIST_IMPORT_IN_PROGRESS');
        return playlistImportDto(existing);
      }
      const nextCategoryId = categoryId ?? null;
      const [updated] = await this.db
        .update(playlistImports)
        .set({
          state: 'EXTRACTING',
          taskId: null,
          categoryId: nextCategoryId,
          visible,
          monitor,
          lastCheckedAt: new Date(),
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(playlistImports.id, existing.id),
            inArray(playlistImports.state, ['READY', 'FAILED']),
          ),
        )
        .returning();
      return playlistImportDto(updated ?? (await this.job(existing.id)));
    }
    const [created] = await this.db
      .insert(playlistImports)
      .values({
        playlistId,
        state: 'EXTRACTING',
        categoryId: categoryId ?? null,
        visible,
        monitor,
        lastCheckedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      return playlistImportDto(created);
    }
    const [row] = await this.db
      .select()
      .from(playlistImports)
      .where(eq(playlistImports.playlistId, playlistId))
      .limit(1);
    return playlistImportDto(row!);
  }

  async retry(id: string): Promise<PlaylistImportJob> {
    const row = await this.job(id);
    if (row.state !== 'FAILED')
      throw new ApiFailure(409, 'PLAYLIST_IMPORT_NOT_FAILED');
    const [updated] = await this.db
      .update(playlistImports)
      .set({
        state: 'EXTRACTING',
        taskId: null,
        errorCode: null,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(playlistImports.id, id), eq(playlistImports.state, 'FAILED')),
      )
      .returning();
    return playlistImportDto(updated ?? (await this.job(id)));
  }

  async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.db
        .select({ id: playlistImports.id })
        .from(playlistImports)
        .where(
          and(
            eq(playlistImports.monitor, true),
            inArray(playlistImports.state, ['READY', 'FAILED']),
            or(
              isNull(playlistImports.lastCheckedAt),
              lt(
                playlistImports.lastCheckedAt,
                new Date(Date.now() - MONITOR_INTERVAL),
              ),
            ),
          ),
        );
      for (const { id } of due) {
        await this.db
          .update(playlistImports)
          .set({
            state: 'EXTRACTING',
            taskId: null,
            errorCode: null,
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(playlistImports.id, id),
              eq(playlistImports.monitor, true),
              inArray(playlistImports.state, ['READY', 'FAILED']),
              or(
                isNull(playlistImports.lastCheckedAt),
                lt(
                  playlistImports.lastCheckedAt,
                  new Date(Date.now() - MONITOR_INTERVAL),
                ),
              ),
            ),
          );
      }
      const rows = await this.db
        .select()
        .from(playlistImports)
        .where(eq(playlistImports.state, 'EXTRACTING'));
      for (const row of rows) await this.process(row);
    } finally {
      this.running = false;
      if (this.refreshRequested) {
        this.refreshRequested = false;
        void this.reconcile().catch((error) =>
          console.error('playlist refresh failed', error),
        );
      }
    }
  }

  async refreshAll(): Promise<{ count: number }> {
    const rows = await this.db
      .update(playlistImports)
      .set({
        state: 'EXTRACTING',
        taskId: null,
        errorCode: null,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(playlistImports.state, ['READY', 'FAILED']))
      .returning({ id: playlistImports.id });
    if (rows.length) {
      if (this.running) this.refreshRequested = true;
      else
        void this.reconcile().catch((error) =>
          console.error('playlist refresh failed', error),
        );
    }
    return { count: rows.length };
  }

  async setMonitor(id: string, monitor: boolean): Promise<PlaylistImportJob> {
    const [updated] = await this.db
      .update(playlistImports)
      .set({ monitor, lastCheckedAt: monitor ? null : undefined })
      .where(eq(playlistImports.id, id))
      .returning();
    if (!updated) throw new ApiFailure(404, 'PLAYLIST_IMPORT_NOT_FOUND');
    return playlistImportDto(updated);
  }

  private async process(row: PlaylistImportRow): Promise<void> {
    try {
      if (row.taskId && Date.now() - row.updatedAt.getTime() > PLAYLIST_TIMEOUT)
        throw new ProviderError('PLAYLIST_EXTRACTION_TIMEOUT');
      let current = row;
      if (!current.taskId) {
        const startedAt = new Date();
        const taskId = await this.media.startYoutubePlaylist(
          playlistUrl(current.playlistId),
        );
        const [updated] = await this.db
          .update(playlistImports)
          .set({ taskId, updatedAt: startedAt })
          .where(eq(playlistImports.id, current.id))
          .returning();
        current = updated!;
      }
      const result = await this.media.reconcileYoutubePlaylist(
        current.taskId!,
        current.playlistId,
      );
      if (
        result.lastRefresh !== null &&
        result.lastRefresh >= Math.floor(current.updatedAt.getTime() / 1000)
      ) {
        await this.db
          .update(playlistImports)
          .set({ title: result.title, videoIds: [...new Set(result.videoIds)] })
          .where(eq(playlistImports.id, current.id));
      }
      if (result.state === 'PENDING') return;
      if (result.state === 'FAILED')
        throw new ProviderError('PLAYLIST_EXTRACTION_FAILED');
      if (
        result.lastRefresh === null ||
        result.lastRefresh < Math.floor(current.updatedAt.getTime() / 1000)
      )
        throw new ProviderError('PLAYLIST_STALE');
      const videoIds = [...new Set(result.videoIds)];
      if (!videoIds.length) throw new ProviderError('PLAYLIST_EMPTY');
      let registrationFailed = false;
      for (const sourceId of videoIds) {
        try {
          await this.imports.enqueuePlaylistVideo(
            sourceId,
            current.categoryId,
            current.visible,
          );
        } catch (error) {
          registrationFailed = true;
          console.error('playlist member registration failed', sourceId, error);
        }
      }
      if (registrationFailed)
        throw new ProviderError('PLAYLIST_MEMBER_REGISTRATION_FAILED');
      await this.db
        .update(playlistImports)
        .set({
          state: 'READY',
          title: result.title,
          videoIds,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(playlistImports.id, current.id));
    } catch (error) {
      await this.db
        .update(playlistImports)
        .set({
          state: 'FAILED',
          errorCode:
            error instanceof ProviderError
              ? error.code
              : 'UPSTREAM_UNAVAILABLE',
          updatedAt: new Date(),
        })
        .where(eq(playlistImports.id, row.id));
    }
  }
}
