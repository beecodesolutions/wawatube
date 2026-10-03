import {
  boolean,
  date,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const id = () => uuid('id').defaultRandom().primaryKey();
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const categories = pgTable('categories', {
  id: id(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  thumbnailMediaId: uuid('thumbnail_media_id').references(() => mediaItems.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
});

export const mediaItems = pgTable(
  'media_items',
  {
    id: id(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    thumbnailRef: text('thumbnail_ref'),
    durationSeconds: doublePrecision('duration_seconds'),
    visible: boolean('visible').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    availability: text('availability').default('MISSING').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('media_source_unique').on(table.sourceType, table.sourceId),
    check(
      'media_source_type_check',
      sql`${table.sourceType} in ('YOUTUBE','LOCAL')`,
    ),
    check(
      'media_availability_check',
      sql`${table.availability} in ('AVAILABLE','MISSING','UNAVAILABLE')`,
    ),
  ],
);

export const mediaCategories = pgTable(
  'media_categories',
  {
    mediaItemId: uuid('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.mediaItemId, table.categoryId] })],
);

export const imports = pgTable(
  'imports',
  {
    id: id(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    state: text('state').notNull(),
    title: text('title'),
    description: text('description'),
    durationSeconds: doublePrecision('duration_seconds'),
    thumbnailUrl: text('thumbnail_url'),
    mediaItemId: uuid('media_item_id').references(() => mediaItems.id, {
      onDelete: 'set null',
    }),
    errorCode: text('error_code'),
    approved: boolean('approved').default(false).notNull(),
    requestedVisible: boolean('requested_visible').default(false).notNull(),
    requestedCategoryIds: text('requested_category_ids')
      .array()
      .default([])
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('import_source_unique').on(table.sourceType, table.sourceId),
  ],
);

export const playlistImports = pgTable(
  'playlist_imports',
  {
    id: id(),
    playlistId: text('playlist_id').notNull(),
    state: text('state').notNull(),
    title: text('title'),
    videoIds: text('video_ids').array().default([]).notNull(),
    taskId: text('task_id'),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    visible: boolean('visible').default(false).notNull(),
    monitor: boolean('monitor').default(false).notNull(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    errorCode: text('error_code'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('playlist_import_playlist_unique').on(table.playlistId),
  ],
);

export const authConfig = pgTable('auth_config', {
  id: integer('id').primaryKey(),
  pinHash: text('pin_hash').notNull(),
  ...timestamps,
});
export const sessions = pgTable('sessions', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
});

export const telemetryDaily = pgTable('telemetry_daily', {
  day: date('day', { mode: 'string' }).primaryKey(),
  seconds: integer('seconds').default(0).notNull(),
  views: integer('views').default(0).notNull(),
});

export const telemetryVideoViews = pgTable('telemetry_video_views', {
  mediaItemId: uuid('media_item_id')
    .primaryKey()
    .references(() => mediaItems.id, { onDelete: 'cascade' }),
  views: integer('views').default(0).notNull(),
});

export const watchSessions = pgTable('watch_sessions', {
  id: uuid('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const videoViews = pgTable(
  'video_views',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => watchSessions.id, { onDelete: 'cascade' }),
    mediaItemId: uuid('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    watchedSeconds: integer('watched_seconds').default(0).notNull(),
    completed: boolean('completed').default(false).notNull(),
  },
  (table) => [
    check(
      'video_views_watched_seconds_check',
      sql`${table.watchedSeconds} >= 0`,
    ),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type MediaRow = typeof mediaItems.$inferSelect;
export type ImportRow = typeof imports.$inferSelect;
export type PlaylistImportRow = typeof playlistImports.$inferSelect;
