import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { PlaybackTelemetry, TelemetryReport } from '@wawatube/shared';
import type { Database } from '../db/index.js';
import { ApiFailure } from '../http/errors.js';
import {
  mediaItems,
  telemetryDaily,
  telemetryVideoViews,
  videoViews,
  watchSessions,
} from '../db/schema.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type IdentifiedTelemetry = PlaybackTelemetry & {
  sessionId: string;
  viewId: string;
  watchedSeconds: number;
};

function isIdentified(
  telemetry: PlaybackTelemetry,
): telemetry is IdentifiedTelemetry {
  const hasSession = telemetry.sessionId !== undefined;
  const hasView = telemetry.viewId !== undefined;
  const hasWatched = telemetry.watchedSeconds !== undefined;
  if (hasSession === hasView && hasView === hasWatched) return hasSession;
  throw new ApiFailure(400, 'INVALID_TELEMETRY_SESSION');
}

export class TelemetryService {
  constructor(private readonly db: Database) {}

  async record(mediaId: string, telemetry: PlaybackTelemetry): Promise<void> {
    if (isIdentified(telemetry)) {
      await this.recordIdentified(mediaId, telemetry);
      return;
    }
    const { views, seconds } = telemetry;
    if (!views && !seconds) return;
    await this.db.transaction((tx) =>
      this.addAggregate(tx, mediaId, seconds, views),
    );
  }

  private async recordIdentified(
    mediaId: string,
    telemetry: IdentifiedTelemetry,
  ): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(watchSessions)
        .set({
          endedAt: sql`${watchSessions.lastActivityAt} + interval '30 minutes'`,
        })
        .where(
          and(
            isNull(watchSessions.endedAt),
            lt(
              watchSessions.lastActivityAt,
              sql`now() - interval '30 minutes'`,
            ),
          ),
        );
      await tx
        .insert(watchSessions)
        .values({
          id: telemetry.sessionId,
          startedAt: now,
          lastActivityAt: now,
          endedAt: null,
        })
        .onConflictDoUpdate({
          target: watchSessions.id,
          set: {
            lastActivityAt: sql`case when ${watchSessions.endedAt} is null
              then greatest(${watchSessions.lastActivityAt}, now())
              else ${watchSessions.lastActivityAt} end`,
          },
        });

      const inserted = await tx
        .insert(videoViews)
        .values({
          id: telemetry.viewId,
          sessionId: telemetry.sessionId,
          mediaItemId: mediaId,
          startedAt: now,
          lastActivityAt: now,
          endedAt: telemetry.ended ? now : null,
          watchedSeconds: telemetry.watchedSeconds,
          completed: telemetry.completed ?? false,
        })
        .onConflictDoNothing({ target: videoViews.id })
        .returning({ id: videoViews.id });

      let secondsDelta = telemetry.watchedSeconds;
      const viewsDelta = inserted.length ? 1 : 0;
      if (!inserted.length) {
        const [existing] = await tx
          .select()
          .from(videoViews)
          .where(eq(videoViews.id, telemetry.viewId))
          .for('update');
        if (!existing) throw new ApiFailure(409, 'TELEMETRY_VIEW_CONFLICT');
        if (
          existing.sessionId !== telemetry.sessionId ||
          existing.mediaItemId !== mediaId
        )
          throw new ApiFailure(409, 'TELEMETRY_VIEW_MISMATCH');
        secondsDelta = Math.max(
          0,
          telemetry.watchedSeconds - existing.watchedSeconds,
        );
        await tx
          .update(videoViews)
          .set({
            lastActivityAt: sql`greatest(${videoViews.lastActivityAt}, now())`,
            endedAt: sql`coalesce(
              ${videoViews.endedAt},
              case when ${telemetry.ended ?? false} then now() else null end
            )`,
            watchedSeconds: sql`greatest(${videoViews.watchedSeconds}, ${telemetry.watchedSeconds})`,
            completed: sql`${videoViews.completed} or ${telemetry.completed ?? false}`,
          })
          .where(eq(videoViews.id, telemetry.viewId));
      }
      await this.addAggregate(tx, mediaId, secondsDelta, viewsDelta);
    });
  }

  private async addAggregate(
    tx: Transaction,
    mediaId: string,
    seconds: number,
    views: number,
  ): Promise<void> {
    if (!seconds && !views) return;
    const day = new Date().toISOString().slice(0, 10);
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
    if (!views) return;
    await tx
      .insert(telemetryVideoViews)
      .values({ mediaItemId: mediaId, views })
      .onConflictDoUpdate({
        target: telemetryVideoViews.mediaItemId,
        set: { views: sql`${telemetryVideoViews.views} + ${views}` },
      });
  }

  async report(timeZone = 'UTC'): Promise<TelemetryReport> {
    try {
      timeZone = new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions()
        .timeZone;
    } catch {
      throw new ApiFailure(400, 'INVALID_TIME_ZONE');
    }
    const localVideoDay = sql<string>`to_char(
      ${videoViews.startedAt} at time zone ${timeZone}, 'YYYY-MM-DD'
    )`;
    const utcVideoDay = sql<string>`to_char(
      ${videoViews.startedAt} at time zone 'UTC', 'YYYY-MM-DD'
    )`;
    const [daily, dailyVideos, videos, recordedDaily] = await Promise.all([
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
          date: localVideoDay,
          mediaId: mediaItems.id,
          title: mediaItems.title,
          seconds: sql<number>`sum(${videoViews.watchedSeconds})::int`,
          views: sql<number>`count(*)::int`,
        })
        .from(videoViews)
        .innerJoin(mediaItems, eq(mediaItems.id, videoViews.mediaItemId))
        .groupBy(sql`1`, mediaItems.id, mediaItems.title)
        .orderBy(sql`1`, asc(mediaItems.title)),
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
      this.db
        .select({
          date: utcVideoDay,
          seconds: sql<number>`sum(${videoViews.watchedSeconds})::int`,
          views: sql<number>`count(*)::int`,
        })
        .from(videoViews)
        .groupBy(utcVideoDay),
    ]);
    // Legacy counters lack timestamps; retain only their unassigned UTC totals.
    const recordedByDay = new Map(recordedDaily.map((day) => [day.date, day]));
    // A recorded view can cross UTC midnight while counters update on packet day.
    let legacySeconds = Math.max(
      0,
      daily.reduce((sum, day) => sum + day.seconds, 0) -
        recordedDaily.reduce((sum, day) => sum + day.seconds, 0),
    );
    const totals = new Map(
      daily.map((day) => {
        const recorded = recordedByDay.get(day.date);
        const seconds = Math.min(
          legacySeconds,
          Math.max(0, day.seconds - (recorded?.seconds ?? 0)),
        );
        legacySeconds -= seconds;
        return [
          day.date,
          {
            date: day.date,
            seconds,
            views: Math.max(0, day.views - (recorded?.views ?? 0)),
          },
        ];
      }),
    );
    for (const video of dailyVideos) {
      const day = totals.get(video.date) ?? {
        date: video.date,
        seconds: 0,
        views: 0,
      };
      day.seconds += video.seconds;
      day.views += video.views;
      totals.set(video.date, day);
    }
    const videosByDay = new Map<
      string,
      TelemetryReport['daily'][number]['videos']
    >();
    for (const video of dailyVideos) {
      const day = videosByDay.get(video.date) ?? [];
      const segment = {
        mediaId: video.mediaId,
        title: video.title,
        seconds: video.seconds,
        views: video.views,
      };
      day.push(segment);
      videosByDay.set(video.date, day);
    }
    return {
      daily: [...totals.values()]
        .filter((day) => day.seconds || day.views)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => {
          const videos = videosByDay.get(day.date);
          return videos?.length ? { ...day, videos } : day;
        }),
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
