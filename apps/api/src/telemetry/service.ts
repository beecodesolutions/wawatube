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
      if (seconds || views)
        await tx
          .insert(telemetryDaily)
          .values({ day, seconds, views })
          .onConflictDoUpdate({
            target: telemetryDaily.day,
            set: {
              seconds: sql`${telemetryDaily.seconds} + ${seconds}`,
              views: sql`${telemetryDaily.views} + ${views}`,
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
        .select({
          date: telemetryDaily.day,
          seconds: telemetryDaily.seconds,
          views: telemetryDaily.views,
        })
        .from(telemetryDaily)
        .orderBy(asc(telemetryDaily.day)),
      this.db
        .select({
          mediaId: mediaItems.id,
          title: mediaItems.title,
          thumbnailRef: mediaItems.thumbnailRef,
          sourceType: mediaItems.sourceType,
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
    return {
      daily,
      videos: videos.map(({ thumbnailRef, sourceType, ...video }) => ({
        ...video,
        thumbnailUrl:
          thumbnailRef || sourceType === 'LOCAL'
            ? `/api/admin/media/${video.mediaId}/thumbnail`
            : null,
      })),
    };
  }
}
