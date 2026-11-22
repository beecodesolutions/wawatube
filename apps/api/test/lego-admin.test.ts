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
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from '../src/db/index.js';
import { LegoService } from '../src/lego/service.js';

function database(inbox: string) {
  const mock = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mock),
    execute: async () => {},
    select: () => ({
      from: () => ({ where: async () => [{ id: 1, inbox }] }),
    }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }),
  };
  return mock as unknown as Database;
}

function service(catalog: string, inbox: string, rebrickableApiKey = '') {
  return new LegoService(database(inbox), {
    legoMediaRoot: catalog,
    legoInbox: inbox,
    legoCacheRoot: join(catalog, '.cache'),
    rebrickableApiKey,
    pdftoppmPath: 'pdftoppm',
  });
}

test('scans and imports PDFs without moving originals or leaving duplicates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wawatube-lego-admin-'));
  const catalog = join(root, 'catalog');
  const inbox = join(root, 'inbox');
  try {
    await mkdir(join(catalog, '31146', 'Existing'), { recursive: true });
    await mkdir(inbox, { recursive: true });
    await writeFile(
      join(catalog, '31146', 'Existing', 'instructions.pdf'),
      'existing',
    );
    const source = join(inbox, '31146-New Model.pdf');
    await writeFile(source, 'new');
    const lego = service(catalog, inbox);
    const scan = await lego.scan();
    assert.deepEqual(scan.candidates, [
      {
        file: '31146-New Model.pdf',
        mocId: null,
        name: 'New Model',
        setId: '31146',
      },
    ]);
    assert.deepEqual(
      await lego.import([
        { file: scan.candidates[0]!.file, name: 'New Model', setId: '31146' },
      ]),
      { imported: 1, skipped: 0 },
    );
    assert.equal(await readFile(source, 'utf8'), 'new');
    assert.equal(
      await readFile(
        join(catalog, '31146', 'New Model', '31146-New Model.pdf'),
        'utf8',
      ),
      'new',
    );
    assert.deepEqual(await lego.scan(), { candidates: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not follow inbox symlinks outside the configured root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wawatube-lego-admin-'));
  const outside = await mkdtemp(join(tmpdir(), 'wawatube-lego-outside-'));
  try {
    const catalog = join(root, 'catalog');
    const inbox = join(root, 'inbox');
    await mkdir(join(catalog, '31146'), { recursive: true });
    await mkdir(inbox, { recursive: true });
    await writeFile(join(outside, 'outside.pdf'), 'outside');
    await symlink(join(outside, 'outside.pdf'), join(inbox, 'outside.pdf'));
    const scan = await service(catalog, inbox).scan();
    assert.deepEqual(scan, { candidates: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('recognizes MOC IDs before extracting set-number tokens', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wawatube-lego-admin-'));
  const originalFetch = globalThis.fetch;
  try {
    const catalog = join(root, 'catalog');
    const inbox = join(root, 'inbox');
    await mkdir(join(catalog, '31146'), { recursive: true });
    await mkdir(inbox, { recursive: true });
    await writeFile(join(inbox, 'MOC-765432_buho.pdf'), 'moc');
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          results: [{ set_num: 'MOC-765432', name: 'Búho' }],
          next: null,
        }),
        { status: 200 },
      );
    const candidates = (await service(catalog, inbox, 'test-key').scan())
      .candidates;
    assert.equal(candidates[0]?.mocId, 'MOC-765432');
    assert.equal(candidates[0]?.setId, '31146');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
