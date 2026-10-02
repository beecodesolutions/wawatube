import { asc, desc, eq, sql } from 'drizzle-orm';
import type { PlaybackTelemetry, TelemetryReport } from '@wawatube/shared';
import type { Database } from '../db/index.js';
import {
  mediaItems,
  telemetryDaily,
  telemetryVideoViews,
} from '../db/schema.js';

export class TelemetryService {
  constructor(private readonly db: Database) {}

  async record(
    mediaId: string,
    { views, seconds }: PlaybackTelemetry,
  ): Promise<void> {
    if (!views && !seconds) return;
    const day = new Date().toISOString().slice(0, 10);
    await this.db.transaction(async (tx) => {
      if (seconds)
        await tx
          .insert(telemetryDaily)
          .values({ day, seconds })
          .onConflictDoUpdate({
            target: telemetryDaily.day,
            set: {
              seconds: sql`${telemetryDaily.seconds} + ${seconds}`,
            },
          });
      if (views)
        await tx
          .insert(telemetryVideoViews)
          .values({ mediaItemId: mediaId, views })
          .onConflictDoUpdate({
            target: telemetryVideoViews.mediaItemId,
            set: {
              views: sql`${telemetryVideoViews.views} + ${views}`,
            },
          });
    });
  }

  async report(): Promise<TelemetryReport> {
    const [daily, videos] = await Promise.all([
      this.db
        .select({ date: telemetryDaily.day, seconds: telemetryDaily.seconds })
        .from(telemetryDaily)
        .orderBy(asc(telemetryDaily.day)),
      this.db
        .select({
          mediaId: mediaItems.id,
          title: mediaItems.title,
          views: sql<number>`coalesce(${telemetryVideoViews.views}, 0)`,
        })
        .from(mediaItems)
        .leftJoin(
          telemetryVideoViews,
          eq(telemetryVideoViews.mediaItemId, mediaItems.id),
        )
        .orderBy(
          desc(sql`coalesce(${telemetryVideoViews.views}, 0)`),
          asc(mediaItems.title),
        ),
    ]);
    return { daily, videos };
  }
}
