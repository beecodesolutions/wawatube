import { asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  AdminMedia,
  Category,
  CategoryInput,
  ChildMedia,
  LibraryResponse,
  MediaUpdate,
  SourceType,
} from '@wawatube/shared';
import type { Database } from '../db/index.js';
import {
  categories,
  imports,
  mediaCategories,
  mediaItems,
  type MediaRow,
} from '../db/schema.js';
import { ApiFailure } from '../http/errors.js';
import { childMedia, type MediaGateway } from '../media-gateway.js';

export const sourceType = (value: string): SourceType =>
  value === 'LOCAL' ? 'LOCAL' : 'YOUTUBE';
export const categoryDto = (row: typeof categories.$inferSelect): Category => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  sortOrder: row.sortOrder,
});
export const importDto = (row: typeof imports.$inferSelect) => ({
  id: row.id,
  sourceType: sourceType(row.sourceType),
  state: row.state as 'EXTRACTING' | 'PREVIEW' | 'QUEUED' | 'READY' | 'FAILED',
  title: row.title,
  description: row.description,
  durationSeconds: row.durationSeconds,
  thumbnailUrl: row.thumbnailUrl
    ? `/api/admin/import/${row.id}/thumbnail`
    : null,
  mediaItemId: row.mediaItemId,
  errorCode: row.errorCode,
});

export class LibraryService {
  constructor(
    private readonly db: Database,
    private readonly media: MediaGateway,
  ) {}

  async categoryIds(ids: string[]): Promise<void> {
    if (new Set(ids).size !== ids.length)
      throw new ApiFailure(400, 'INVALID_CATEGORY_IDS');
    if (!ids.length) return;
    const rows = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.id, ids));
    if (rows.length !== ids.length)
      throw new ApiFailure(400, 'CATEGORY_NOT_FOUND');
  }

  async categories(): Promise<Category[]> {
    return (
      await this.db
        .select()
        .from(categories)
        .orderBy(asc(categories.sortOrder), asc(categories.name))
    ).map(categoryDto);
  }
  async categoryMedia(
    id: string,
  ): Promise<{ category: Category; media: ChildMedia[] }> {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    if (!category) throw new ApiFailure(404, 'CATEGORY_NOT_FOUND');
    const rows = await this.db
      .select({ media: mediaItems })
      .from(mediaCategories)
      .innerJoin(mediaItems, eq(mediaCategories.mediaItemId, mediaItems.id))
      .where(eq(mediaCategories.categoryId, id))
      .orderBy(asc(mediaItems.sortOrder), asc(mediaItems.title));
    const visible = (
      await Promise.all(
        rows.map(async ({ media }) =>
          (await this.childVisible(media)) ? childMedia(media) : null,
        ),
      )
    ).filter((item): item is ChildMedia => item !== null);
    return { category: categoryDto(category), media: visible };
  }
  async childVisible(row: MediaRow): Promise<boolean> {
    return (
      row.visible &&
      (await this.media.available(sourceType(row.sourceType), row.sourceId))
    );
  }
  async childItem(id: string): Promise<MediaRow> {
    const [row] = await this.db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.id, id))
      .limit(1);
    if (!row || !(await this.childVisible(row)))
      throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
    return row;
  }
  async adminItem(id: string): Promise<MediaRow> {
    const [row] = await this.db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.id, id))
      .limit(1);
    if (!row) throw new ApiFailure(404, 'MEDIA_NOT_FOUND');
    return row;
  }
  async adminMedia(row: MediaRow): Promise<AdminMedia> {
    const links = await this.db
      .select({ id: mediaCategories.categoryId })
      .from(mediaCategories)
      .where(eq(mediaCategories.mediaItemId, row.id));
    const available = await this.media.available(
      sourceType(row.sourceType),
      row.sourceId,
    );
    return {
      ...childMedia(row),
      thumbnailUrl: row.thumbnailRef
        ? `/api/admin/media/${row.id}/thumbnail`
        : null,
      sourceType: sourceType(row.sourceType),
      visible: row.visible,
      sortOrder: row.sortOrder,
      categoryIds: links.map((link) => link.id),
      availability: available ? 'AVAILABLE' : 'MISSING',
    };
  }
  async library(): Promise<LibraryResponse> {
    const rows = await this.db
      .select()
      .from(mediaItems)
      .orderBy(desc(mediaItems.createdAt));
    const list = await Promise.all(rows.map((row) => this.adminMedia(row)));
    const pending = await this.db
      .select()
      .from(imports)
      .orderBy(desc(imports.createdAt));
    return {
      media: list,
      imports: pending.map(importDto),
      counts: {
        total: list.length,
        available: list.filter((item) => item.availability === 'AVAILABLE')
          .length,
        downloading: pending.filter(
          (job) => job.state === 'EXTRACTING' || job.state === 'QUEUED',
        ).length,
        failed: pending.filter((job) => job.state === 'FAILED').length,
      },
    };
  }
  async createCategory(body: CategoryInput): Promise<Category> {
    const name = body.name.trim();
    const icon = body.icon.trim();
    if (!name || !icon) throw new ApiFailure(400, 'INVALID_REQUEST');
    const [row] = await this.db
      .insert(categories)
      .values({ name, icon, sortOrder: body.sortOrder ?? 0 })
      .returning();
    return categoryDto(row!);
  }
  async updateCategory(id: string, body: CategoryInput): Promise<Category> {
    const name = body.name.trim();
    const icon = body.icon.trim();
    if (!name || !icon) throw new ApiFailure(400, 'INVALID_REQUEST');
    const [row] = await this.db
      .update(categories)
      .set({
        name,
        icon,
        sortOrder: body.sortOrder ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id))
      .returning();
    if (!row) throw new ApiFailure(404, 'CATEGORY_NOT_FOUND');
    return categoryDto(row);
  }
  async deleteCategory(id: string): Promise<void> {
    await this.db.delete(categories).where(eq(categories.id, id));
  }
  async updateMedia(id: string, body: MediaUpdate): Promise<AdminMedia> {
    if (body.title !== undefined && !body.title.trim())
      throw new ApiFailure(400, 'INVALID_REQUEST');
    return this.db.transaction(async (tx) => {
      if (body.categoryIds) {
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
      }
      const [row] = await tx
        .update(mediaItems)
        .set({
          ...(body.title === undefined ? {} : { title: body.title.trim() }),
          ...(body.visible === undefined ? {} : { visible: body.visible }),
          ...(body.sortOrder === undefined
            ? {}
            : { sortOrder: body.sortOrder }),
          updatedAt: new Date(),
        })
        .where(eq(mediaItems.id, id))
        .returning();
      if (!row) throw new ApiFailure(404, 'MEDIA_NOT_FOUND');
      if (body.categoryIds) {
        await tx
          .delete(mediaCategories)
          .where(eq(mediaCategories.mediaItemId, id));
        if (body.categoryIds.length)
          await tx.insert(mediaCategories).values(
            body.categoryIds.map((categoryId) => ({
              mediaItemId: id,
              categoryId,
            })),
          );
      }
      return {
        ...childMedia(row),
        thumbnailUrl: row.thumbnailRef
          ? `/api/admin/media/${row.id}/thumbnail`
          : null,
        sourceType: sourceType(row.sourceType),
        visible: row.visible,
        sortOrder: row.sortOrder,
        categoryIds:
          body.categoryIds ??
          (
            await tx
              .select({ id: mediaCategories.categoryId })
              .from(mediaCategories)
              .where(eq(mediaCategories.mediaItemId, id))
          ).map((x) => x.id),
        availability: (await this.media.available(
          sourceType(row.sourceType),
          row.sourceId,
        ))
          ? 'AVAILABLE'
          : 'MISSING',
      };
    });
  }
  async deleteMedia(id: string): Promise<void> {
    await this.db.delete(mediaItems).where(eq(mediaItems.id, id));
  }
  async localImport(
    sourceId: string,
    categoryIds: string[],
    visible: boolean,
  ): Promise<AdminMedia> {
    const metadata = await this.media.metadata('LOCAL', sourceId);
    if (!(await this.media.available('LOCAL', sourceId)))
      throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
    const row = await this.db.transaction(async (tx) => {
      if (new Set(categoryIds).size !== categoryIds.length)
        throw new ApiFailure(400, 'INVALID_CATEGORY_IDS');
      const found = categoryIds.length
        ? await tx
            .select({ id: categories.id })
            .from(categories)
            .where(inArray(categories.id, categoryIds))
        : [];
      if (found.length !== categoryIds.length)
        throw new ApiFailure(400, 'CATEGORY_NOT_FOUND');
      const [item] = await tx
        .insert(mediaItems)
        .values({
          sourceType: 'LOCAL',
          sourceId,
          title: metadata.title,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          thumbnailRef: metadata.thumbnailRef,
          visible,
          availability: 'AVAILABLE',
        })
        .onConflictDoUpdate({
          target: [mediaItems.sourceType, mediaItems.sourceId],
          set: {
            title: metadata.title,
            description: metadata.description,
            durationSeconds: metadata.durationSeconds,
            thumbnailRef: metadata.thumbnailRef,
            visible,
            availability: 'AVAILABLE',
            updatedAt: new Date(),
          },
        })
        .returning();
      await tx
        .delete(mediaCategories)
        .where(eq(mediaCategories.mediaItemId, item!.id));
      if (categoryIds.length)
        await tx.insert(mediaCategories).values(
          categoryIds.map((categoryId) => ({
            mediaItemId: item!.id,
            categoryId,
          })),
        );
      return item!;
    });
    return this.adminMedia(row);
  }
}
