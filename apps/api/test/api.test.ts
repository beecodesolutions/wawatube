import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import * as schema from '../src/db/schema.js';
import { createSession } from '../src/auth/service.js';
import { ImportService } from '../src/imports/service.js';
import type { MediaGateway } from '../src/media-gateway.js';
import { LocalMediaProvider } from '../src/providers/local-media-provider.js';

const metadata = {
  title: 'Video',
  description: null,
  durationSeconds: 3.4,
  thumbnailRef: null,
};

test('API isolates hidden media, validates bodies, serves local ranges and resumes approved imports', async () => {
  const config = loadConfig();
  const schemaName = `wawatube_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const sql = postgres(config.databaseUrl, { max: 1 });
  const mediaRoot = await mkdtemp(join(tmpdir(), 'wawatube-api-'));
  let app: ReturnType<typeof createApp> | undefined;
  try {
    await sql.unsafe(`CREATE SCHEMA "${schemaName}"`);
    await sql.unsafe(`SET search_path TO "${schemaName}"`);
    const migration = await readFile(
      new URL('../migrations/0000_init.sql', import.meta.url),
      'utf8',
    );
    await sql.unsafe(migration, [], { prepare: false });
    await sql.unsafe(
      await readFile(
        new URL('../migrations/0001_playlist_imports.sql', import.meta.url),
        'utf8',
      ),
      [],
      { prepare: false },
    );
    await sql.unsafe(
      await readFile(
        new URL('../migrations/0002_category_thumbnails.sql', import.meta.url),
        'utf8',
      ),
      [],
      { prepare: false },
    );
    await sql.unsafe(
      await readFile(
        new URL('../migrations/0003_telemetry.sql', import.meta.url),
        'utf8',
      ),
      [],
      { prepare: false },
    );
    await sql.unsafe(
      await readFile(
        new URL(
          '../migrations/0005_telemetry_daily_views.sql',
          import.meta.url,
        ),
        'utf8',
      ),
      [],
      { prepare: false },
    );
    await sql.unsafe(
      await readFile(
        new URL('../migrations/0006_watch_telemetry.sql', import.meta.url),
        'utf8',
      ),
      [],
      { prepare: false },
    );
    const db = drizzle(sql, { schema });
    const file = join(mediaRoot, 'sample.mp4');
    await writeFile(file, Buffer.from('0123456789'));
    let availableYoutube = false;
    let failedYoutube = false;
    let queued = 0;
    const local = new LocalMediaProvider(mediaRoot);
    const media: MediaGateway = {
      metadata: async (source, id) =>
        source === 'LOCAL' ? local.metadata(id) : metadata,
      available: async (source, id) =>
        source === 'LOCAL' ? local.available(id) : availableYoutube,
      playback: async (source, id) =>
        source === 'LOCAL'
          ? local.playback(id)
          : { kind: 'upstream', path: '/media/video.mp4' },
      thumbnail: async (source, id) =>
        source === 'LOCAL' ? local.thumbnail(id) : null,
      localCandidates: async () => [
        { sourceId: 'sample.mp4', title: 'Sample' },
      ],
      previewYoutube: async () => metadata,
      queueYoutube: async () => {
        queued++;
      },
      youtubeState: async () => (availableYoutube ? 'READY' : 'QUEUED'),
      reconcileYoutube: async () => ({
        metadata,
        available: availableYoutube,
        failed: failedYoutube,
      }),
      startYoutubePlaylist: async () => 'playlist-task',
      reconcileYoutubePlaylist: async () => ({
        state: 'PENDING' as const,
        title: null,
        videoIds: [],
        lastRefresh: null,
      }),
      upstream: async () => new Response(null, { status: 404 }),
    };
    const imports = new ImportService(db, media);
    app = createApp({
      db,
      config: { ...config, localMediaRoot: mediaRoot },
      media,
      imports,
    });
    await app.ready();
    const login = {
      method: 'POST' as const,
      url: '/api/admin/auth/login',
      payload: { pin: '0000' },
    };
    assert.equal(
      (
        await app.inject({
          ...login,
          headers: { host: 'localhost:3100', origin: 'http://localhost:3100' },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          ...login,
          headers: { host: 'localhost:3100', origin: 'https://evil.example' },
        })
      ).statusCode,
      403,
    );
    const session = await createSession(db, 1);
    const cookie = `wawatube_session=${session.token}`;
    const admin = { cookie };
    const categoryResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/categories',
      headers: admin,
      payload: { name: 'Test', icon: 'star' },
    });
    assert.equal(categoryResponse.statusCode, 200);
    const categoryId = categoryResponse.json().id as string;
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/categories',
          headers: admin,
          payload: { name: 42, icon: 'star' },
        })
      ).statusCode,
      400,
    );
    const hidden = await db
      .insert(schema.mediaItems)
      .values({
        sourceType: 'LOCAL',
        sourceId: 'sample.mp4',
        title: 'Hidden',
        visible: false,
        availability: 'AVAILABLE',
      })
      .returning();
    const hiddenId = hidden[0]!.id;

    const [automatic] = await db
      .insert(schema.mediaItems)
      .values({
        sourceType: 'YOUTUBE',
        sourceId: 'category-automatic',
        title: 'Automatic first',
        visible: true,
        sortOrder: 0,
        availability: 'AVAILABLE',
      })
      .returning();
    const [manual] = await db
      .insert(schema.mediaItems)
      .values({
        sourceType: 'YOUTUBE',
        sourceId: 'category-manual',
        title: 'Manual second',
        thumbnailRef: 'thumbnail.jpg',
        visible: true,
        sortOrder: 1,
        availability: 'AVAILABLE',
      })
      .returning();
    const [outside] = await db
      .insert(schema.mediaItems)
      .values({
        sourceType: 'YOUTUBE',
        sourceId: 'category-outside',
        title: 'Outside',
        thumbnailRef: 'thumbnail.jpg',
        visible: true,
        availability: 'AVAILABLE',
      })
      .returning();
    await db.insert(schema.mediaCategories).values([
      { mediaItemId: automatic!.id, categoryId },
      { mediaItemId: manual!.id, categoryId },
    ]);
    availableYoutube = true;
    const automaticCategory = (
      await app.inject({
        url: '/api/kids/categories',
      })
    )
      .json()
      .find((item: { id: string }) => item.id === categoryId);
    assert.equal(automaticCategory.thumbnailMediaId, null);
    assert.equal(automaticCategory.thumbnailUrl, null);
    await db
      .update(schema.mediaItems)
      .set({ thumbnailRef: 'thumbnail.jpg' })
      .where(eq(schema.mediaItems.id, automatic!.id));
    const automaticWithThumbnail = (
      await app.inject({ url: '/api/kids/categories' })
    )
      .json()
      .find((item: { id: string }) => item.id === categoryId);
    assert.equal(
      automaticWithThumbnail.thumbnailUrl,
      `/api/kids/media/${automatic!.id}/thumbnail`,
    );
    const selected = await app.inject({
      method: 'PATCH',
      url: `/api/admin/categories/${categoryId}`,
      headers: admin,
      payload: {
        name: 'Test',
        icon: 'star',
        thumbnailMediaId: manual!.id,
      },
    });
    assert.equal(selected.statusCode, 200);
    assert.equal(selected.json().thumbnailMediaId, manual!.id);
    assert.equal(
      selected.json().thumbnailUrl,
      `/api/kids/media/${manual!.id}/thumbnail`,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/categories/${categoryId}`,
          headers: admin,
          payload: {
            name: 'Test',
            icon: 'star',
            thumbnailMediaId: outside!.id,
          },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/categories/${categoryId}`,
          headers: admin,
          payload: {
            name: 'Test',
            icon: 'star',
            thumbnailMediaId: '00000000-0000-4000-8000-000000000000',
          },
        })
      ).statusCode,
      400,
    );
    await db
      .update(schema.mediaItems)
      .set({ visible: false })
      .where(eq(schema.mediaItems.id, manual!.id));
    const fallback = await app.inject({
      url: `/api/kids/categories/${categoryId}/media`,
    });
    assert.equal(fallback.statusCode, 200);
    assert.equal(fallback.json().category.thumbnailMediaId, null);
    assert.equal(
      fallback.json().category.thumbnailUrl,
      `/api/kids/media/${automatic!.id}/thumbnail`,
    );
    const reset = await app.inject({
      method: 'PATCH',
      url: `/api/admin/categories/${categoryId}`,
      headers: admin,
      payload: { name: 'Test', icon: 'star', thumbnailMediaId: null },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().thumbnailMediaId, null);
    assert.equal(
      reset.json().thumbnailUrl,
      `/api/kids/media/${automatic!.id}/thumbnail`,
    );
    await db
      .update(schema.mediaItems)
      .set({ visible: true })
      .where(eq(schema.mediaItems.id, manual!.id));
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/categories/${categoryId}`,
      headers: admin,
      payload: { name: 'Test', icon: 'star', thumbnailMediaId: manual!.id },
    });
    await db
      .delete(schema.mediaCategories)
      .where(eq(schema.mediaCategories.mediaItemId, manual!.id));
    const unassigned = (
      await app.inject({ url: '/api/kids/categories' })
    ).json()[0];
    assert.equal(unassigned.thumbnailMediaId, null);
    assert.equal(
      unassigned.thumbnailUrl,
      `/api/kids/media/${automatic!.id}/thumbnail`,
    );
    await db
      .delete(schema.mediaItems)
      .where(eq(schema.mediaItems.id, manual!.id));
    const afterDelete = (
      await app.inject({ url: '/api/admin/categories', headers: admin })
    ).json()[0];
    assert.equal(afterDelete.thumbnailMediaId, null);
    assert.equal(
      afterDelete.thumbnailUrl,
      `/api/kids/media/${automatic!.id}/thumbnail`,
    );
    availableYoutube = false;
    assert.equal(
      (await app.inject({ url: '/api/kids/categories' })).json()[0]
        .thumbnailUrl,
      null,
    );

    for (const route of ['', '/play', '/thumbnail'])
      assert.equal(
        (await app.inject({ url: `/api/kids/media/${hiddenId}${route}` }))
          .statusCode,
        404,
      );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: { views: 1, seconds: 1 },
        })
      ).statusCode,
      404,
    );
    await db
      .update(schema.mediaItems)
      .set({ visible: true })
      .where(eq(schema.mediaItems.id, hiddenId));
    await db
      .update(schema.mediaItems)
      .set({ availability: 'MISSING' })
      .where(eq(schema.mediaItems.id, hiddenId));
    assert.equal(
      (await app.inject({ url: `/api/kids/media/${hiddenId}` })).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: { views: 1, seconds: 3 },
        })
      ).statusCode,
      204,
    );
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const viewId = '22222222-2222-4222-8222-222222222222';
    const secondViewId = '33333333-3333-4333-8333-333333333333';
    const identified = (watchedSeconds: number, extra = {}) =>
      app!.inject({
        method: 'POST',
        url: `/api/kids/media/${hiddenId}/telemetry`,
        payload: {
          views: 1,
          seconds: 30,
          sessionId,
          viewId,
          watchedSeconds,
          ...extra,
        },
      });
    assert.equal((await identified(5)).statusCode, 204);
    assert.equal((await identified(3)).statusCode, 204);
    assert.equal(
      (await identified(8, { completed: true, ended: true })).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: {
            views: 1,
            seconds: 30,
            sessionId,
            viewId: secondViewId,
            watchedSeconds: 2,
          },
        })
      ).statusCode,
      204,
    );
    const concurrent = await Promise.all([identified(10), identified(9)]);
    assert.deepEqual(
      concurrent.map((response) => response.statusCode).sort(),
      [204, 204],
    );
    const [concurrentView] = await db
      .select()
      .from(schema.videoViews)
      .where(eq(schema.videoViews.id, viewId));
    assert.equal(concurrentView!.watchedSeconds, 10);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: { views: 1, seconds: 30, sessionId },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: {
            views: 1,
            seconds: 30,
            sessionId,
            viewId,
            watchedSeconds: 8,
          },
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: {
            views: 1,
            seconds: 30,
            sessionId: '44444444-4444-4444-8444-444444444444',
            viewId,
            watchedSeconds: 9,
          },
        })
      ).statusCode,
      409,
    );
    const [view] = await db
      .select()
      .from(schema.videoViews)
      .where(eq(schema.videoViews.id, viewId));
    assert.equal(view!.watchedSeconds, 10);
    assert.equal(view!.completed, true);
    assert.ok(view!.endedAt);
    assert.equal((await db.select().from(schema.watchSessions)).length, 1);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: { views: 0, seconds: 4 },
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/kids/media/${hiddenId}/telemetry`,
          payload: { views: 0, seconds: 31 },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await app.inject({ url: '/api/admin/telemetry' })).statusCode,
      401,
    );
    const telemetry = await app.inject({
      url: '/api/admin/telemetry',
      headers: admin,
    });
    assert.equal(telemetry.statusCode, 200);
    assert.deepEqual(telemetry.json().videos, [
      {
        mediaId: hiddenId,
        title: 'Hidden',
        views: 3,
        thumbnailUrl: `/api/admin/media/${hiddenId}/thumbnail`,
      },
      {
        mediaId: automatic!.id,
        title: 'Automatic first',
        views: 0,
        thumbnailUrl: `/api/admin/media/${automatic!.id}/thumbnail`,
      },
      {
        mediaId: outside!.id,
        title: 'Outside',
        views: 0,
        thumbnailUrl: `/api/admin/media/${outside!.id}/thumbnail`,
      },
    ]);
    assert.deepEqual(telemetry.json().daily, [
      {
        date: new Date().toISOString().slice(0, 10),
        seconds: 19,
        views: 3,
        videos: [{ mediaId: hiddenId, title: 'Hidden', seconds: 12, views: 2 }],
      },
    ]);
    const bytes = await app.inject({
      url: `/api/kids/media/${hiddenId}/play`,
      headers: { range: 'bytes=-3' },
    });
    assert.equal(bytes.statusCode, 206);
    assert.equal(bytes.headers['content-range'], 'bytes 7-9/10');
    assert.equal(bytes.body, '789');
    assert.equal(
      (
        await app.inject({
          method: 'HEAD',
          url: `/api/kids/media/${hiddenId}/play`,
          headers: { range: 'bytes=0-2' },
        })
      ).statusCode,
      206,
    );
    assert.equal(
      (
        await app.inject({
          url: `/api/kids/media/${hiddenId}/play`,
          headers: { range: 'bytes=50-60' },
        })
      ).statusCode,
      416,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/media/${hiddenId}`,
          headers: admin,
          payload: { visible: 'yes' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/import/local',
          headers: admin,
          payload: {
            sourceId: '../sample.mp4',
            categoryIds: [],
            visible: true,
          },
        })
      ).statusCode,
      400,
    );
    const started = await app.inject({
      method: 'POST',
      url: '/api/admin/import/youtube',
      headers: admin,
      payload: { url: 'https://youtu.be/jNQXAC9IVRw' },
    });
    assert.equal(started.statusCode, 202);
    const job = started.json();
    assert.equal(job.state, 'PREVIEW');
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/import/${job.id}/confirm`,
          headers: admin,
          payload: { categoryIds: [], visible: true },
        })
      ).statusCode,
      200,
    );
    assert.equal(queued, 1);
    assert.equal(
      (
        await db
          .select()
          .from(schema.mediaItems)
          .where(eq(schema.mediaItems.sourceId, 'jNQXAC9IVRw'))
      ).length,
      0,
    );
    const restarted = new ImportService(db, media);
    await restarted.reconcile();
    assert.equal(queued, 2);
    failedYoutube = true;
    await restarted.reconcile();
    assert.equal((await restarted.job(job.id)).state, 'FAILED');
    assert.equal((await imports.retry(job.id)).state, 'QUEUED');
    assert.equal(queued, 3);
    failedYoutube = false;
    availableYoutube = true;
    await restarted.reconcile();
    assert.equal((await restarted.job(job.id)).state, 'READY');
    assert.equal(
      (
        await db
          .select()
          .from(schema.mediaItems)
          .where(eq(schema.mediaItems.sourceId, 'jNQXAC9IVRw'))
      ).length,
      1,
    );
    const importedId = (await restarted.job(job.id)).mediaItemId!;
    await db
      .delete(schema.mediaItems)
      .where(eq(schema.mediaItems.id, importedId));
    const restartedJob = await imports.start('jNQXAC9IVRw');
    assert.equal(restartedJob.state, 'PREVIEW');
    const republished = await imports.confirm(job.id, {
      categoryIds: [],
      visible: false,
    });
    assert.equal(republished.state, 'READY');
    assert.equal(
      (
        await db
          .select()
          .from(schema.mediaItems)
          .where(eq(schema.mediaItems.sourceId, 'jNQXAC9IVRw'))
      ).length,
      1,
    );
  } finally {
    await app?.close();
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await sql.end();
    await rm(mediaRoot, { recursive: true, force: true });
  }
});
