import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import postgres from '../apps/api/node_modules/postgres/src/index.js';

function stableId(value) {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Historical logs contain request times, not payloads. Distribute the retained
// daily seconds by observed playback span; preserve each daily total exactly.
export function reconstructUsage(log, daily, since) {
  const runs = [];
  for (const line of log.split('\n')) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const match = row.req?.url?.match(
      /^\/api\/kids\/media\/([0-9a-f-]+)\/telemetry$/i,
    );
    if (
      !match ||
      row.req.method !== 'POST' ||
      !Number.isFinite(row.time) ||
      row.time < since
    )
      continue;
    const last = runs.at(-1);
    if (last && last.mediaId === match[1] && row.time - last.end < 30 * 60_000)
      last.end = row.time;
    else runs.push({ mediaId: match[1], start: row.time, end: row.time });
  }
  const sessions = [];
  for (const run of runs) {
    let session = sessions.at(-1);
    if (!session || run.start - session.end >= 30 * 60_000) {
      session = {
        id: stableId(`watch-session:${run.start}`),
        start: run.start,
        end: run.end,
        views: [],
      };
      sessions.push(session);
    }
    session.end = run.end;
    session.views.push({
      ...run,
      id: stableId(`video-view:${run.start}:${run.mediaId}`),
      watchedSeconds: 0,
    });
  }
  const views = sessions.flatMap((session) => session.views);
  for (const day of daily) {
    const date = new Date(day.day).toISOString().slice(0, 10);
    const entries = views.filter(
      (view) => new Date(view.start).toISOString().slice(0, 10) === date,
    );
    if (entries.length !== day.views)
      throw new Error(
        `Log/view count mismatch for ${date}: ${entries.length} logs, ${day.views} retained views`,
      );
    const weight = entries.reduce(
      (sum, view) => sum + Math.max(1, view.end - view.start),
      0,
    );
    let allocated = 0;
    entries.forEach((view, index) => {
      view.watchedSeconds =
        index === entries.length - 1
          ? day.seconds - allocated
          : Math.floor(
              (day.seconds * Math.max(1, view.end - view.start)) / weight,
            );
      allocated += view.watchedSeconds;
    });
  }
  if (views.length !== daily.reduce((sum, day) => sum + day.views, 0))
    throw new Error('Logs include views outside retained days');
  return sessions;
}

async function main() {
  const args = process.argv.slice(2);
  const since = Date.parse(args[args.indexOf('--since') + 1] ?? '');
  if (!args.includes('--since') || !Number.isFinite(since))
    throw new Error(
      'Usage: node --env-file=.env scripts/reconstruct-usage.mjs --since ISO_TIMESTAMP [--write]',
    );
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const log = execFileSync(
    'journalctl',
    [
      '--user',
      '-u',
      'wawatube',
      '--since',
      `@${Math.floor(since / 1000)}`,
      '--no-pager',
      '-o',
      'cat',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      // Only the short database phase blocks telemetry writes. Playback reads
      // remain available; a newly-started view aborts safely on count mismatch.
      await tx`set local lock_timeout = '2s'`;
      await tx`set local statement_timeout = '10s'`;
      await tx`lock table telemetry_daily, telemetry_video_views in share mode`;
      const daily = await tx`select * from telemetry_daily order by day`;
      const sessions = reconstructUsage(log, daily, since);
      const views = sessions.flatMap((session) => session.views);
      const retained =
        await tx`select media_item_id, views from telemetry_video_views where views > 0`;
      const counts = new Map();
      for (const view of views)
        counts.set(view.mediaId, (counts.get(view.mediaId) ?? 0) + 1);
      if (
        retained.length !== counts.size ||
        retained.some((row) => counts.get(row.media_item_id) !== row.views)
      )
        throw new Error('Per-video counts do not match retained history');
      if (args.includes('--write')) {
        await tx`lock table watch_sessions, video_views in share row exclusive mode`;
        const ids = sessions.map((session) => session.id);
        const other =
          await tx`select count(*)::int as count from watch_sessions where id != all(${ids}::uuid[])`;
        if (other[0].count)
          throw new Error(
            'Recorded sessions already exist; refusing to mix reconstruction with live recording',
          );
        const backup = `/tmp/wawatube-session-backfill-${Date.now()}.json`;
        writeFileSync(
          backup,
          JSON.stringify(
            {
              daily,
              retained,
              sessions: await tx`select * from watch_sessions`,
              views: await tx`select * from video_views`,
            },
            null,
            2,
          ),
          { mode: 0o600, flag: 'wx' },
        );
        console.log(`Backup: ${backup}`);
        for (const session of sessions) {
          const start = new Date(session.start),
            end = new Date(session.end);
          const closed = Date.now() - session.end >= 30 * 60_000 ? end : null;
          await tx`insert into watch_sessions (id, started_at, last_activity_at, ended_at) values (${session.id}, ${start}, ${end}, ${closed}) on conflict(id) do update set last_activity_at=excluded.last_activity_at, ended_at=excluded.ended_at`;
          for (const view of session.views) {
            const viewEnd =
              view === session.views.at(-1) && !closed
                ? null
                : new Date(view.end);
            await tx`insert into video_views (id, session_id, media_item_id, started_at, last_activity_at, ended_at, watched_seconds, completed) values (${view.id}, ${session.id}, ${view.mediaId}, ${new Date(view.start)}, ${new Date(view.end)}, ${viewEnd}, ${view.watchedSeconds}, false) on conflict(id) do update set last_activity_at=excluded.last_activity_at, ended_at=excluded.ended_at, watched_seconds=excluded.watched_seconds`;
          }
        }
        const totals =
          await tx`select sum(watched_seconds)::int as seconds,count(*)::int as views from video_views`;
        if (
          totals[0].seconds !==
            daily.reduce((sum, day) => sum + day.seconds, 0) ||
          totals[0].views !== views.length
        )
          throw new Error('Reconstruction totals mismatch');
      }
      console.log(
        JSON.stringify(
          {
            written: args.includes('--write'),
            sessions: sessions.length,
            views: views.length,
            daily,
            sessionIds: sessions.map((session) => session.id),
          },
          null,
          2,
        ),
      );
    });
  } finally {
    await sql.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
