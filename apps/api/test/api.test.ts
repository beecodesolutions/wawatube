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
    const session = await createSession(db, 1);
    const cookie = `wawatube_session=${session.token}`;
    const admin = { cookie };
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/categories',
          headers: admin,
          payload: { name: 'Test', icon: 'star' },
        })
      ).statusCode,
      200,
    );
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
    for (const route of ['', '/play', '/thumbnail'])
      assert.equal(
        (await app.inject({ url: `/api/kids/media/${hiddenId}${route}` }))
          .statusCode,
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
