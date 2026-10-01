import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ThumbnailCache } from './thumbnail-cache.js';
import { TubeArchivistService } from './tube-archivist-service.js';

const id = 'dQw4w9WgXcQ';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]);

test('recovers missing artwork once, persists it, and never sends credentials to CDN', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wawatube-thumbs-'));
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.hostname);
    if (url.hostname === 'archive.test')
      return new Response(null, { status: 404 });
    assert.equal(url.href, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    assert.equal(init?.headers, undefined);
    assert.equal(init?.redirect, 'error');
    return new Response(jpeg);
  };
  try {
    const service = new TubeArchivistService(
      'http://archive.test',
      'secret',
      directory,
    );
    const path = `/cache/videos/d/${id}.jpg`;
    const results = await Promise.all([
      service.resource(path, {}),
      service.resource(path, {}),
    ]);
    for (const response of results)
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), jpeg);
    assert.deepEqual(calls, ['archive.test', 'i.ytimg.com']);
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    const restarted = new TubeArchivistService(
      'http://archive.test',
      'secret',
      directory,
    );
    assert.equal((await restarted.resource(path, {})).status, 200);
    const head = await restarted.resource(path, {}, 'HEAD');
    assert.equal(head.headers.get('content-type'), 'image/jpeg');
    assert.equal(await head.text(), '');
    await assert.rejects(service.resource('https://evil.test' + path, {}), {
      code: 'INVALID_RESOURCE',
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps valid originals; failed or invalid repairs remain retryable', async () => {
  const originalFetch = globalThis.fetch;
  const cache = new ThumbnailCache();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('<html>error</html>');
  };
  try {
    assert.equal(
      (await cache.get(id, async () => new Response(jpeg))).status,
      200,
    );
    assert.equal(calls, 0);
    const missing = async () => new Response(null, { status: 404 });
    await assert.rejects(cache.get(id, missing), {
      code: 'THUMBNAIL_UNAVAILABLE',
    });
    globalThis.fetch = async () => new Response(jpeg);
    assert.equal((await cache.get(id, missing)).status, 200);
    await assert.rejects(cache.get('../secret', missing), {
      code: 'INVALID_VIDEO_ID',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
