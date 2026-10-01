import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LocalMediaProvider } from './local-media-provider.js';
import { ProviderError } from './errors.js';
import { TubeArchivistService } from './tube-archivist-service.js';
import {
  YouTubeMediaProvider,
  youtubeIdFromUrl,
  youtubePlaylistIdFromUrl,
} from './youtube-media-provider.js';

const videoId = 'dQw4w9WgXcQ';
describe('local media provider', () => {
  it('rejects traversal and skips symlinks outside the root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wawatube-local-'));
    const outside = await mkdtemp(join(tmpdir(), 'wawatube-outside-'));
    await writeFile(join(root, 'ok.mp4'), 'video');
    await writeFile(join(root, 'percent%20name.mp4'), 'video');
    await writeFile(join(outside, 'secret.mp4'), 'secret');
    await symlink(join(outside, 'secret.mp4'), join(root, 'secret.mp4'));
    const provider = new LocalMediaProvider(root);

    assert.deepEqual(await provider.discover(), [
      { sourceId: 'ok.mp4', title: 'ok' },
      { sourceId: 'percent%20name.mp4', title: 'percent%20name' },
    ]);
    await assert.rejects(
      provider.playback('../secret.mp4'),
      (error: unknown) =>
        error instanceof ProviderError && error.code === 'INVALID_SOURCE',
    );
    assert.equal(await provider.available('secret.mp4'), false);
    assert.equal(
      await new LocalMediaProvider(join(root, 'unmounted')).available('ok.mp4'),
      false,
    );
  });
});

describe('youtube URL parsing', () => {
  it('accepts supported URL forms and rejects other hosts', () => {
    assert.equal(
      youtubeIdFromUrl(`https://www.youtube.com/watch?v=${videoId}`),
      videoId,
    );
    assert.equal(youtubeIdFromUrl(`https://youtu.be/${videoId}`), videoId);
    assert.throws(
      () => youtubeIdFromUrl(`https://example.com/watch?v=${videoId}`),
      (error: unknown) =>
        error instanceof ProviderError && error.code === 'INVALID_URL',
    );
  });

  it('accepts playlist links only on trusted YouTube hosts', () => {
    assert.equal(
      youtubePlaylistIdFromUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345678',
      ),
      'PL12345678',
    );
    assert.equal(
      youtubePlaylistIdFromUrl('https://youtu.be/dQw4w9WgXcQ?list=PL12345678'),
      'PL12345678',
    );
    for (const url of [
      'https://evil.example/playlist?list=PL12345678',
      'javascript:alert(1)',
      'https://www.youtube.com/watch?list=bad',
      'https://user:pass@www.youtube.com/watch?list=PL12345678',
    ])
      assert.throws(() => youtubePlaylistIdFromUrl(url), {
        code: 'INVALID_URL',
      });
  });
});

describe('YouTube media provider', () => {
  it('marks archived metadata unavailable when the media file is gone', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      if (url.pathname === `/api/video/${videoId}/`) {
        return new Response(
          JSON.stringify({
            title: 'Archived',
            media_url: '/youtube/video.mp4',
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(null, { status: 404 });
    };
    try {
      const service = new TubeArchivistService(
        'http://127.0.0.1:18000',
        'secret',
      );
      assert.equal(
        await new YouTubeMediaProvider(service).available(videoId),
        false,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TubeArchivist service', () => {
  it('uses the verified preview, pending, queue and archived endpoints', async () => {
    const requests: { method: string; path: string; body: string }[] = [];
    let archivedCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      requests.push({ method, path: url.pathname + url.search, body });
      if (
        method === 'POST' &&
        url.pathname === '/api/download/' &&
        url.search === '?autostart=false'
      ) {
        return new Response(JSON.stringify({ task_id: 'task-1' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (method === 'GET' && url.pathname === `/api/download/${videoId}/`) {
        return new Response(
          JSON.stringify({
            title: 'Pending',
            duration: '19s',
            vid_thumb_url: '/cache/videos/j/jpg.jpg',
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      if (method === 'GET' && url.pathname === `/api/video/${videoId}/`) {
        archivedCalls += 1;
        if (archivedCalls === 1) return new Response(null, { status: 404 });
        return new Response(
          JSON.stringify({
            title: 'Archived',
            media_url: '/media/video.mp4',
            player: { duration: 62 },
            vid_thumb_url: '/media/thumb.jpg',
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      if (method === 'POST' && url.pathname === `/api/download/${videoId}/`)
        return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    };
    try {
      const service = new TubeArchivistService(
        'http://127.0.0.1:18000',
        'secret',
      );
      const preview = await service.preview(videoId);
      assert.equal(preview.taskId, 'task-1');
      assert.equal(preview.metadata?.durationSeconds, 19);
      await service.queue(videoId);
      assert.deepEqual(await service.metadataResource(videoId), {
        mediaPath: '/media/video.mp4',
        thumbnailPath: '/media/thumb.jpg',
      });
      assert.deepEqual(requests[0], {
        method: 'GET',
        path: `/api/video/${videoId}/`,
        body: '',
      });
      assert.deepEqual(JSON.parse(requests[1]?.body ?? '{}'), {
        data: [{ youtube_id: videoId, status: 'pending' }],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('polls a playlist task before reading its fresh flat record', async () => {
    const requests: string[] = [];
    let taskStatus: string | null = null;
    let lastRefresh: string | number | null = 1;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
      if (init?.method === 'POST' && url.pathname === '/api/download/')
        return new Response(JSON.stringify({ task_id: 'task-playlist' }));
      if (url.pathname === '/api/task/by-id/task-playlist/')
        return taskStatus === null
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify({ status: taskStatus }));
      if (url.pathname === '/api/playlist/PL12345678/')
        return new Response(
          JSON.stringify({
            playlist_name: 'Playlist',
            playlist_last_refresh: lastRefresh,
            playlist_entries: [
              { youtube_id: videoId },
              { youtube_id: videoId },
              { youtube_id: 'private-entry' },
            ],
          }),
        );
      return new Response(null, { status: 404 });
    };
    try {
      const service = new TubeArchivistService(
        'http://127.0.0.1:18000',
        'secret',
      );
      assert.equal(
        await service.startPlaylist(
          'https://www.youtube.com/playlist?list=PL12345678',
        ),
        'task-playlist',
      );
      assert.equal(
        (await service.playlistTask('task-playlist', 'PL12345678')).state,
        'PENDING',
      );
      taskStatus = 'STARTED';
      assert.equal(
        (await service.playlistTask('task-playlist', 'PL12345678')).state,
        'PENDING',
      );
      assert.equal(
        requests.some((path) => path.includes('/api/playlist/')),
        true,
      );
      taskStatus = 'SUCCESS';
      assert.deepEqual(
        await service.playlistTask('task-playlist', 'PL12345678'),
        {
          state: 'READY',
          title: 'Playlist',
          videoIds: [videoId],
          lastRefresh: 1,
        },
      );
      assert.deepEqual(requests, [
        'POST /api/download/?autostart=false',
        'GET /api/task/by-id/task-playlist/',
        'GET /api/task/by-id/task-playlist/',
        'GET /api/playlist/PL12345678/',
        'GET /api/task/by-id/task-playlist/',
        'GET /api/playlist/PL12345678/',
      ]);
      lastRefresh = '2026-10-01T20:15:59+00:00';
      const iso = await service.playlistTask('task-playlist', 'PL12345678');
      assert.equal(iso.lastRefresh, Date.parse(lastRefresh) / 1000);
      for (const invalid of [null, 'invalid-date']) {
        lastRefresh = invalid;
        await assert.rejects(service.playlist('PL12345678'), {
          code: 'UPSTREAM_INVALID_RESPONSE',
        });
      }
      taskStatus = 'FAILURE';
      assert.equal(
        (await service.playlistTask('task-playlist', 'PL12345678')).state,
        'FAILED',
      );
      taskStatus = 'unexpected';
      await assert.rejects(
        service.playlistTask('task-playlist', 'PL12345678'),
        { code: 'UPSTREAM_INVALID_RESPONSE' },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects untrusted resource origins and paths', async () => {
    const service = new TubeArchivistService(
      'https://tube.example.test',
      'secret',
    );
    await assert.rejects(
      () => service.resource('https://evil.example.test/media/video.mp4', {}),
      { code: 'INVALID_RESOURCE' },
    );
    await assert.rejects(
      () => service.resource('/media/../cache/videos/video.mp4', {}),
      { code: 'INVALID_RESOURCE' },
    );
  });
});
