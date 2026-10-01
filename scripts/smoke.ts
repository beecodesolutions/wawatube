import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  AdminMedia,
  Category,
  ImportJob,
  LibraryResponse,
} from '../packages/shared/src/index.js';

// Run only against a disposable/new library. PIN comes from environment, never source.
const base = process.env.WAWATUBE_TEST_URL ?? 'http://127.0.0.1:3100';
const origin = process.env.PUBLIC_ORIGIN ?? base;
const pin = process.env.WAWATUBE_TEST_PIN;
assert(pin, 'Set WAWATUBE_TEST_PIN before running this test.');
const page = await fetch(`${base}/parent`);
const html = await page.text();
const asset = html.match(/src="([^"]+\.js)"/)?.[1];
assert(asset, 'Production page must load its JavaScript bundle.');
const bundle = await fetch(new URL(asset, base));
assert.equal(bundle.status, 200);
assert(bundle.headers.get('content-type')?.includes('javascript'));
await bundle.body?.cancel();
let cookie = '';
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  authenticated = true,
  headers: Record<string, string> = {},
) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}
async function json<T>(response: Response, expected = 200): Promise<T> {
  const text = await response.text();
  assert.equal(response.status, expected, text);
  return JSON.parse(text) as T;
}
assert.equal(
  (await request('/admin/media', 'GET', undefined, false)).status,
  401,
);
assert.equal(
  (
    await request('/admin/auth/login', 'POST', { pin }, false, {
      Origin: 'https://untrusted.invalid',
    })
  ).status,
  403,
);
const login = await request('/admin/auth/login', 'POST', { pin }, false);
assert.equal(login.status, 204);
const setCookie = login.headers.get('set-cookie');
assert(setCookie);
assert(setCookie?.includes('HttpOnly'));
assert(setCookie?.includes('SameSite=Strict'));
cookie = setCookie.split(';')[0] ?? '';
const category = await json<Category>(
  await request('/admin/categories', 'POST', {
    name: `Prueba ${Date.now()}`,
    icon: '🧪',
  }),
  200,
);
const created: string[] = [];
try {
  const invalid = await request('/admin/import/local', 'POST', {
    sourceId: '../../etc/passwd',
    categoryIds: [category.id],
    visible: true,
  });
  assert(
    [400, 404].includes(invalid.status),
    `Traversal rejected: ${invalid.status}`,
  );
  const local = await json<AdminMedia>(
    await request('/admin/import/local', 'POST', {
      sourceId: 'prueba-colores.mp4',
      categoryIds: [category.id],
      visible: true,
    }),
    201,
  );
  created.push(local.id);
  assert.equal(local.sourceType, 'LOCAL');
  for (const range of ['bytes=0-99', 'bytes=-100']) {
    const response = await request(
      `/kids/media/${local.id}/play`,
      'GET',
      undefined,
      false,
      { Range: range },
    );
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 100);
    assert(response.headers.get('content-range')?.startsWith('bytes '));
  }
  assert.equal(
    (await request(`/kids/media/${local.id}/play`, 'HEAD', undefined, false))
      .status,
    200,
  );
  assert.equal(
    (
      await request(`/kids/media/${local.id}/play`, 'GET', undefined, false, {
        Range: 'bytes=99999999999-',
      })
    ).status,
    416,
  );
  const thumbnail = await request(
    `/kids/media/${local.id}/thumbnail`,
    'GET',
    undefined,
    false,
  );
  assert.equal(thumbnail.status, 200);
  assert(thumbnail.headers.get('content-type')?.startsWith('image/'));
  await thumbnail.arrayBuffer();
  const kid = await json<Record<string, unknown>>(
    await request(`/kids/media/${local.id}`, 'GET', undefined, false),
  );
  assert(!('sourceId' in kid) && !('sourceType' in kid));
  const hidden = await request(`/admin/media/${local.id}`, 'PATCH', {
    visible: false,
  });
  assert.equal(hidden.status, 200);
  for (const suffix of ['', '/play', '/thumbnail'])
    assert.equal(
      (
        await request(
          `/kids/media/${local.id}${suffix}`,
          'GET',
          undefined,
          false,
        )
      ).status,
      404,
    );
  const listing = await json<{ media: AdminMedia[] }>(
    await request(
      `/kids/categories/${category.id}/media`,
      'GET',
      undefined,
      false,
    ),
  );
  assert.equal(listing.media.length, 0);
  if (process.argv.includes('--youtube')) {
    let job = await json<ImportJob>(
      await request('/admin/import/youtube', 'POST', {
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      }),
      202,
    );
    for (let i = 0; i < 30 && job.state === 'EXTRACTING'; i++) {
      await delay(1000);
      job = await json<ImportJob>(await request(`/admin/import/${job.id}`));
    }
    assert.equal(job.state, 'PREVIEW');
    const confirmation = await request(
      `/admin/import/${job.id}/confirm`,
      'POST',
      { categoryIds: [category.id], visible: true },
    );
    assert([200, 202].includes(confirmation.status), await confirmation.text());
    for (let i = 0; i < 60; i++) {
      job = await json<ImportJob>(await request(`/admin/import/${job.id}`));
      if (job.state === 'READY' || job.state === 'FAILED') break;
      await delay(1000);
    }
    assert.equal(job.state, 'READY', job.errorCode ?? 'download incomplete');
    assert(job.mediaItemId);
    created.push(job.mediaItemId);
    const response = await request(
      `/kids/media/${job.mediaItemId}/play`,
      'GET',
      undefined,
      false,
      { Range: 'bytes=0-99' },
    );
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 100);
    await request(`/admin/media/${job.mediaItemId}`, 'PATCH', {
      visible: false,
    });
    assert.equal(
      (
        await request(
          `/kids/media/${job.mediaItemId}/play`,
          'GET',
          undefined,
          false,
        )
      ).status,
      404,
    );
  }
  const library = await json<LibraryResponse>(await request('/admin/media'));
  assert(library.counts.total >= created.length);
  console.log(
    'PASS: PIN/session/origin, local ranges/HEAD/416, thumbnails, traversal, approval filtering' +
      (process.argv.includes('--youtube')
        ? ', real YouTube import/playback'
        : ''),
  );
} finally {
  for (const id of created) await request(`/admin/media/${id}`, 'DELETE');
  await request(`/admin/categories/${category.id}`, 'DELETE');
  await request('/admin/auth/logout', 'POST');
}
assert.equal((await request('/admin/media')).status, 401);
console.log(
  'PASS: logout revokes session. Test metadata removed; source files preserved.',
);
