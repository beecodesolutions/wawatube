import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { createSession } from '../src/auth/service.js';
import { loadConfig } from '../src/config.js';
import * as schema from '../src/db/schema.js';
import type { MediaGateway } from '../src/media-gateway.js';
import { ImportService } from '../src/imports/service.js';
import { PlaylistImportService } from '../src/imports/playlist-service.js';

const metadata = {
  title: 'Video',
  description: null,
  durationSeconds: 3,
  thumbnailRef: null,
};

test('playlist imports persist extraction, preserve categories, and retry members', async () => {
  const config = loadConfig();
  const schemaName = `wawatube_playlist_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const sql = postgres(config.databaseUrl, { max: 1 });
  let app: ReturnType<typeof createApp> | undefined;
  try {
    await sql.unsafe(`CREATE SCHEMA "${schemaName}"`);
    await sql.unsafe(`SET search_path TO "${schemaName}"`);
    for (const migration of [
      '0000_init.sql',
      '0001_playlist_imports.sql',
      '0002_category_thumbnails.sql',
      '0003_telemetry.sql',
      '0004_playlist_monitor.sql',
      '0006_watch_telemetry.sql',
    ])
      await sql.unsafe(
        await readFile(
          new URL(`../migrations/${migration}`, import.meta.url),
          'utf8',
        ),
        [],
        { prepare: false },
      );
    const db = drizzle(sql, { schema });
    const [categoryA] = await db
      .insert(schema.categories)
      .values({ name: 'A', icon: 'a' })
      .returning();
    const [categoryB] = await db
      .insert(schema.categories)
      .values({ name: 'B', icon: 'b' })
      .returning();
    const existingId = 'dQw4w9WgXcQ';
    const newId = 'jNQXAC9IVRw';
    const inaccessibleId = '9bZkp7q19f0';
    const [existing] = await db
      .insert(schema.mediaItems)
      .values({
        sourceType: 'YOUTUBE',
        sourceId: existingId,
        title: 'Existing',
        visible: true,
        availability: 'AVAILABLE',
      })
      .returning();
    await db.insert(schema.mediaCategories).values({
      mediaItemId: existing!.id,
      categoryId: categoryA!.id,
    });
    let playlistPolls = 0;
    let queued = 0;
    let members = [existingId, newId, newId, inaccessibleId];
    let lastRefresh = () => Math.floor(Date.now() / 1000) + 1;
    let recovered = false;
    let previewReady = true;
    let playlistStarts = 0;
    const media: MediaGateway = {
      remove: async () => {},
      metadata: async () => metadata,
      available: async (_source, sourceId) => sourceId === existingId,
      playback: async () => ({ kind: 'upstream', path: '/media/video.mp4' }),
      thumbnail: async () => null,
      localCandidates: async () => [],
      previewYoutube: async () => (previewReady ? metadata : null),
      queueYoutube: async () => {
        queued++;
      },
      youtubeState: async () => 'QUEUED',
      reconcileYoutube: async (_sourceId) => ({
        metadata: _sourceId === inaccessibleId && !recovered ? null : metadata,
        available: recovered,
        failed: _sourceId === inaccessibleId && !recovered,
      }),
      startYoutubePlaylist: async () => {
        playlistStarts++;
        return 'task-1';
      },
      reconcileYoutubePlaylist: async () => {
        playlistPolls++;
        return playlistPolls === 1
          ? {
              state: 'PENDING' as const,
              title: 'Playlist',
              videoIds: members,
              lastRefresh: lastRefresh(),
            }
          : {
              state: 'READY' as const,
              title: 'Playlist',
              videoIds: members,
              lastRefresh: lastRefresh(),
            };
      },
      upstream: async () => new Response(null, { status: 404 }),
    };
    const imports = new ImportService(db, media);
    const playlists = new PlaylistImportService(db, media, imports);
    app = createApp({ db, config, media, imports, playlistImports: playlists });
    await app.ready();
    const session = await createSession(db, 1);
    const headers = { cookie: `wawatube_session=${session.token}` };
    const request = {
      method: 'POST' as const,
      url: '/api/admin/import/youtube/playlist',
      payload: {
        url: 'https://www.youtube.com/playlist?list=PL12345678',
        categoryId: categoryB!.id,
        visible: false,
        monitor: false,
      },
    };
    assert.equal((await app.inject(request)).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          ...request,
          headers: { ...headers, origin: 'https://evil.example' },
        })
      ).statusCode,
      403,
    );
    for (const payload of [
      {
        ...request.payload,
        url: 'https://evil.example/playlist?list=PL12345678',
      },
      {
        ...request.payload,
        categoryId: '00000000-0000-4000-8000-000000000000',
      },
      { ...request.payload, visible: 'true' },
      { ...request.payload, monitor: 'true' },
    ])
      assert.equal(
        (await app.inject({ ...request, headers, payload })).statusCode,
        400,
      );
    const response = await app.inject({ ...request, headers });
    assert.equal(response.statusCode, 202);
    const started = response.json();
    assert.equal(started.state, 'EXTRACTING');
    assert.equal(
      (await playlists.start('PL12345678', categoryB!.id, false, false)).id,
      started.id,
    );
    await assert.rejects(
      playlists.start('PL12345678', undefined, false, false),
      {
        code: 'PLAYLIST_IMPORT_IN_PROGRESS',
      },
    );
    await playlists.reconcile();
    assert.equal((await playlists.job(started.id)).state, 'EXTRACTING');
    assert.equal((await playlists.job(started.id)).title, 'Playlist');
    assert.equal((await playlists.job(started.id)).videoIds.length, 3);
    // A fresh service resumes the persisted upstream task without submitting again.
    await new PlaylistImportService(db, media, imports).reconcile();
    assert.equal(playlistStarts, 1);
    const ready = await playlists.job(started.id);
    assert.equal(ready.state, 'READY');
    assert.equal(ready.videoIds.length, 3);
    assert.equal(playlistPolls, 2);

    const links = await db
      .select({ categoryId: schema.mediaCategories.categoryId })
      .from(schema.mediaCategories)
      .where(eq(schema.mediaCategories.mediaItemId, existing!.id));
    assert.deepEqual(
      new Set(links.map(({ categoryId }) => categoryId)),
      new Set([categoryA!.id, categoryB!.id]),
    );
    assert.equal(
      (
        await db
          .select()
          .from(schema.imports)
          .where(eq(schema.imports.sourceType, 'YOUTUBE'))
      ).length,
      2,
    );
    // Playlist videos start as soon as extraction completes, before polling.
    assert.equal(queued, 1);
    await imports.reconcile();
    assert.equal(queued, 1); // Polling must not submit the same download again.
    const failed = await db
      .select()
      .from(schema.imports)
      .where(eq(schema.imports.sourceId, inaccessibleId));
    assert.equal(failed[0]?.state, 'FAILED');
    const progressResponse = await app.inject({
      url: '/api/admin/media',
      headers,
    });
    assert.equal(progressResponse.statusCode, 200);
    const progress = progressResponse.json().playlistImports[0];
    assert.equal(progress.videoCount, 3);
    assert.equal(progress.downloadedCount, 1);
    assert.equal(progress.failedCount, 1);
    assert.equal(progress.pendingCount, 1);

    const duplicate = await playlists.start(
      'PL12345678',
      categoryB!.id,
      false,
      false,
    );
    assert.equal(duplicate.id, started.id);
    assert.equal((await db.select().from(schema.imports)).length, 2);
    await playlists.reconcile();

    await db
      .update(schema.playlistImports)
      .set({ state: 'FAILED', errorCode: 'UPSTREAM_ERROR' })
      .where(eq(schema.playlistImports.id, started.id));
    const retried = await playlists.retry(started.id);
    assert.equal(retried.state, 'EXTRACTING');
    await playlists.reconcile();
    assert.equal((await playlists.job(started.id)).state, 'READY');

    // Optional category: a new member stays uncategorized and inherits visibility.
    members = ['abcdefghijk'];
    const optional = await app.inject({
      ...request,
      headers,
      payload: {
        url: 'https://www.youtube.com/playlist?list=PL87654321',
        visible: true,
        monitor: false,
      },
    });
    assert.equal(optional.statusCode, 202);
    await playlists.reconcile();
    const [uncategorized] = await db
      .select()
      .from(schema.imports)
      .where(eq(schema.imports.sourceId, members[0]!));
    assert.deepEqual(uncategorized!.requestedCategoryIds, []);
    assert.equal(uncategorized!.requestedVisible, true);
    const [categorized] = await db
      .select()
      .from(schema.imports)
      .where(eq(schema.imports.sourceId, newId));
    assert.deepEqual(categorized!.requestedCategoryIds, [categoryB!.id]);
    assert.equal(categorized!.requestedVisible, false);
    assert.equal(
      (
        await db
          .select()
          .from(schema.mediaItems)
          .where(eq(schema.mediaItems.id, existing!.id))
      )[0]!.visible,
      true,
    );

    // A retry that waits on upstream metadata remains approved and publishes automatically.
    await imports.reconcile();
    previewReady = false;
    assert.equal((await imports.retry(failed[0]!.id)).state, 'EXTRACTING');
    recovered = true;
    await imports.reconcile();
    assert.equal((await imports.job(failed[0]!.id)).state, 'QUEUED');
    await imports.reconcile();
    assert.equal((await imports.job(failed[0]!.id)).state, 'READY');
    const [published] = await db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.sourceId, newId));
    assert.equal(published!.visible, false);
    assert.deepEqual(
      (
        await db
          .select()
          .from(schema.mediaCategories)
          .where(eq(schema.mediaCategories.mediaItemId, published!.id))
      ).map((x) => x.categoryId),
      [categoryB!.id],
    );

    const monitorUrl = `/api/admin/playlist-import/${started.id}/monitor`;
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: monitorUrl,
          payload: { monitor: true },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: monitorUrl,
          headers,
          payload: { monitor: 'true' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: monitorUrl,
          headers,
          payload: { monitor: true },
        })
      ).statusCode,
      200,
    );
    members = [existingId, newId, 'kJQP7kiw5Fk'];
    await playlists.reconcile();
    assert.equal((await playlists.job(started.id)).state, 'READY');
    assert.equal((await playlists.job(started.id)).videoIds.length, 3);
    assert.equal((await db.select().from(schema.imports)).length, 4);
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: monitorUrl,
          headers,
          payload: { monitor: false },
        })
      ).statusCode,
      200,
    );
    members = [...members, 'ZZ5LpwO-An4'];
    await playlists.reconcile();
    assert.equal((await playlists.job(started.id)).videoIds.length, 3);

    const [other] = await db
      .insert(schema.playlistImports)
      .values({
        playlistId: 'PLOTHER123',
        state: 'READY',
        monitor: false,
      })
      .returning();
    const beforeRefresh = await playlists.job(started.id);
    const refreshUrl = `/api/admin/playlist-import/${started.id}/refresh`;
    assert.equal(
      (await app.inject({ method: 'POST', url: refreshUrl })).statusCode,
      401,
    );
    const refreshResponse = await app.inject({
      method: 'POST',
      url: refreshUrl,
      headers,
    });
    assert.equal(refreshResponse.statusCode, 200);
    assert.equal(refreshResponse.json().state, 'EXTRACTING');
    for (
      let attempt = 0;
      attempt < 100 && (await playlists.job(started.id)).state === 'EXTRACTING';
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    const refreshed = await playlists.job(started.id);
    assert.equal(refreshed.state, 'READY');
    assert.equal(refreshed.videoIds.length, 4);
    assert.equal(refreshed.categoryId, beforeRefresh.categoryId);
    assert.equal(refreshed.visible, beforeRefresh.visible);
    assert.equal(refreshed.monitor, beforeRefresh.monitor);
    assert.equal((await playlists.job(other!.id)).state, 'READY');
    await db
      .delete(schema.playlistImports)
      .where(eq(schema.playlistImports.id, other!.id));

    // Completed upstream tasks must not reuse stale/empty playlist metadata.
    lastRefresh = () => 1;
    const stale = await playlists.start('PLSTALE123', undefined, true, false);
    await playlists.reconcile();
    assert.equal((await playlists.job(stale.id)).errorCode, 'PLAYLIST_STALE');
    lastRefresh = () => Math.floor(Date.now() / 1000) + 1;
    members = [];
    await playlists.retry(stale.id);
    await playlists.reconcile();
    assert.equal((await playlists.job(stale.id)).errorCode, 'PLAYLIST_EMPTY');
    // Expired upstream tasks surface retryable failure rather than waiting forever.
    const timeout = await playlists.start('PLTIMEOUT1', undefined, true, false);
    await db
      .update(schema.playlistImports)
      .set({
        taskId: 'lost-task',
        updatedAt: new Date(Date.now() - 31 * 60_000),
      })
      .where(eq(schema.playlistImports.id, timeout.id));
    await playlists.reconcile();
    assert.equal(
      (await playlists.job(timeout.id)).errorCode,
      'PLAYLIST_EXTRACTION_TIMEOUT',
    );
    const retriedResponse = await app.inject({
      method: 'POST',
      url: `/api/admin/playlist-import/${timeout.id}/retry`,
      headers,
    });
    assert.equal(retriedResponse.statusCode, 200);
    assert.equal(retriedResponse.json().state, 'EXTRACTING');
    const library = await app.inject({ url: '/api/admin/media', headers });
    assert.equal(library.statusCode, 200);
    assert.equal(library.json().playlistImports.length, 4);
  } finally {
    await app?.close();
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await sql.end();
  }
});
