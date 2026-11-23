import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import test from 'node:test';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from '../src/db/index.js';
import { LegoService } from '../src/lego/service.js';

const emptyDb = {
  select: () => ({
    from: () => ({ where: async () => [] }),
  }),
} as unknown as Database;

function service(root: string, cacheRoot: string, rebrickableApiKey = '') {
  return new LegoService(emptyDb, {
    legoMediaRoot: root,
    legoCacheRoot: cacheRoot,
    rebrickableApiKey,
    pdftoppmPath: 'pdftoppm',
  });
}

test('discovers exact set/MOC/PDF layout with stable directory IDs and confinement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wawatube-lego-'));
  const outside = await mkdtemp(join(tmpdir(), 'wawatube-lego-outside-'));
  try {
    const moc = join(root, '31129', 'Zorro');
    await mkdir(moc, { recursive: true });
    await writeFile(join(root, '31129', 'portada.png'), 'set cover');
    await writeFile(join(moc, 'portada.jpg'), 'moc cover');
    await writeFile(join(moc, 'instrucciones.pdf'), '%PDF-damaged');
    await writeFile(join(root, '31129', 'stray.pdf'), '%PDF-stray');
    await writeFile(join(outside, 'outside.pdf'), '%PDF-outside');
    await mkdir(join(root, '31129', 'Escape'), { recursive: true });
    await symlink(
      join(outside, 'outside.pdf'),
      join(root, '31129', 'Escape', 'instructions.pdf'),
    );

    const lego = service(root, join(root, 'cache'));
    const first = await lego.sets();
    assert.equal(first.sets.length, 1);
    assert.equal(first.sets[0]!.name, '31129');
    assert.match(first.sets[0]!.id, /^[A-Za-z0-9_-]+$/);
    assert.ok(first.sets[0]!.coverUrl);

    const mocs = await lego.mocs(first.sets[0]!.id);
    assert.deepEqual(
      mocs.mocs.map((item) => item.name),
      ['Zorro'],
    );
    assert.match(mocs.mocs[0]!.id, /^[A-Za-z0-9_-]+$/);
    assert.ok(mocs.mocs[0]!.coverUrl);
    assert.equal(mocs.mocs[0]!.page, 1);
    assert.equal(
      (await lego.mocCover(mocs.mocs[0]!.id))?.path,
      join(moc, 'portada.jpg'),
    );
    assert.equal(
      (await lego.mocPdf(mocs.mocs[0]!.id))?.path,
      join(moc, 'instrucciones.pdf'),
    );
    assert.equal(await lego.mocPdf('bW9jOi4uL2V2aWw'), null);

    const second = await lego.sets();
    assert.equal(second.sets[0]!.id, first.sets[0]!.id);
    assert.equal(
      (await lego.mocs(second.sets[0]!.id)).mocs[0]!.id,
      mocs.mocs[0]!.id,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('uses local cover first and atomically caches mocked Rebrickable image extension', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wawatube-lego-'));
  const cacheRoot = join(root, 'cache');
  const originalFetch = globalThis.fetch;
  const png = Buffer.from('\x89PNG\r\n\x1a\n', 'binary');
  const calls: string[] = [];
  try {
    const moc = join(root, '12345-2', 'MOC');
    await mkdir(moc, { recursive: true });
    await writeFile(join(moc, 'instructions.pdf'), '%PDF-damaged');
    const lego = service(root, cacheRoot, 'test-key');
    const set = (await lego.sets()).sets[0]!;
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      if (calls.length === 1)
        return new Response(
          JSON.stringify({ set_img_url: 'https://img.test/cover.png' }),
          { status: 200 },
        );
      return new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };
    const cached = await lego.setCover(set.id);
    assert.equal(extname(cached?.path ?? ''), '.png');
    assert.deepEqual(await readFile(cached!.path), png);
    assert.match(calls[0]!, /\/12345-2\//);

    await writeFile(join(root, '12345-2', 'portada.jpg'), 'local');
    const local = await lego.setCover(set.id);
    assert.equal(local?.path, join(root, '12345-2', 'portada.jpg'));
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('uses a Rebrickable MOC image by PDF identifier and keeps it available offline', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wawatube-moc-cover-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, '31146', 'Custom name');
  const cache = join(root, '.cache');
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'MOC-170054_instructions.pdf'),
    '%PDF-example',
  );
  const id = Buffer.from('moc:31146/Custom name').toString('base64url');
  const png = Buffer.from('\x89PNG\r\n\x1a\n', 'binary');
  const request = t.mock.method(globalThis, 'fetch', async (url: URL) => {
    if (url.hostname === 'cdn.rebrickable.com') return new Response(png);
    assert.match(url.pathname, /31146-1\/alternates\/$/);
    return Response.json({
      results: [
        {
          set_num: 'MOC-170054',
          name: 'Example',
          moc_img_url: 'https://cdn.rebrickable.com/example.png',
        },
      ],
    });
  });
  const downloaded = await service(root, cache, 'test-key').mocCover(id);
  assert.equal(downloaded?.contentType, 'image/png');
  assert.deepEqual(await readFile(downloaded!.path), png);
  assert.deepEqual(await service(root, cache).mocCover(id), downloaded);
  assert.equal(request.mock.callCount(), 2);

  const override = join(directory, 'portada.jpg');
  await writeFile(override, 'manual cover');
  assert.equal((await service(root, cache).mocCover(id))?.path, override);
});
