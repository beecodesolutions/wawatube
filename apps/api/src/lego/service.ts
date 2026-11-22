import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { inArray } from 'drizzle-orm';
import type { LegoMoc, LegoSet } from '@wawatube/shared';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/index.js';
import { legoMocProgress } from '../db/schema.js';

export interface LegoAsset {
  root: string;
  path: string;
  contentType: string;
}

interface SetEntry {
  id: string;
  name: string;
  path: string;
  cover: string | null;
  cachedCover: string | null;
  mocs: MocEntry[];
}
interface MocEntry {
  id: string;
  name: string;
  path: string;
  cover: string | null;
}

const isPdf = (name: string) => extname(name).toLowerCase() === '.pdf';
const isImage = (name: string) =>
  ['.jpg', '.jpeg', '.png'].includes(extname(name).toLowerCase());
const isHidden = (name: string) => name.startsWith('.');
const opaqueId = (kind: 'set' | 'moc', path: string) =>
  Buffer.from(`${kind}:${path}`, 'utf8').toString('base64url');

async function existingFile(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}

export class LegoNotFoundError extends Error {
  constructor() {
    super('LEGO_NOT_FOUND');
  }
}

export class LegoService {
  private readonly root: string;
  constructor(
    private readonly db: Database,
    private readonly config: Pick<
      AppConfig,
      'legoMediaRoot' | 'legoCacheRoot' | 'rebrickableApiKey' | 'pdftoppmPath'
    >,
  ) {
    this.root = resolve(config.legoMediaRoot);
  }

  async sets(): Promise<{ sets: LegoSet[] }> {
    const entries = await this.discover();
    return {
      sets: await Promise.all(
        entries.map(async (entry) => ({
          id: entry.id,
          name: entry.name,
          coverUrl: (await this.hasSetCover(entry))
            ? `/api/lego/sets/${entry.id}/cover`
            : null,
        })),
      ),
    };
  }

  async mocs(setId: string): Promise<{ setName: string; mocs: LegoMoc[] }> {
    const set = await this.resolveSet(setId);
    if (!set) throw new LegoNotFoundError();
    const ids = set.mocs.map((moc) => moc.id);
    const rows = ids.length
      ? await this.db
          .select()
          .from(legoMocProgress)
          .where(inArray(legoMocProgress.mocId, ids))
      : [];
    const pages = new Map(rows.map((row) => [row.mocId, row.page]));
    return {
      setName: set.name,
      mocs: await Promise.all(
        set.mocs.map(async (moc) => ({
          id: moc.id,
          name: moc.name,
          coverUrl: (await this.hasMocCover(moc))
            ? `/api/lego/mocs/${moc.id}/cover`
            : null,
          pdfUrl: `/api/lego/mocs/${moc.id}/pdf`,
          page: pages.get(moc.id) ?? 1,
        })),
      ),
    };
  }

  async setProgress(id: string, page: number): Promise<{ success: true }> {
    const moc = await this.resolveMoc(id);
    if (!moc) throw new LegoNotFoundError();
    const updatedAt = new Date();
    await this.db
      .insert(legoMocProgress)
      .values({ mocId: id, page, updatedAt })
      .onConflictDoUpdate({
        target: legoMocProgress.mocId,
        set: { page, updatedAt },
      });
    return { success: true };
  }

  async setCover(id: string): Promise<LegoAsset | null> {
    const set = await this.resolveSet(id);
    return set ? this.coverAsset(set) : null;
  }
  async mocCover(id: string): Promise<LegoAsset | null> {
    const moc = await this.resolveMoc(id);
    return moc ? this.coverAsset(moc) : null;
  }
  async mocPdf(id: string): Promise<LegoAsset | null> {
    const moc = await this.resolveMoc(id);
    const path = moc ? await existingFile(moc.path) : null;
    return path
      ? { root: this.root, path, contentType: 'application/pdf' }
      : null;
  }

  private async coverAsset(
    entry: SetEntry | MocEntry,
  ): Promise<LegoAsset | null> {
    const override = await existingFile(entry.cover);
    if (override)
      return {
        root: this.root,
        path: override,
        contentType: imageType(override),
      };
    if ('cachedCover' in entry) {
      const cached = await existingFile(entry.cachedCover);
      if (cached)
        return {
          root: this.config.legoCacheRoot,
          path: cached,
          contentType: imageType(cached),
        };
      const fetched = await this.fetchRebrickableCover(entry.name);
      if (fetched)
        return {
          root: this.config.legoCacheRoot,
          path: fetched,
          contentType: imageType(fetched),
        };
    }
    const thumbnail =
      'path' in entry && isPdf(entry.path) ? await this.thumbnail(entry) : null;
    return thumbnail
      ? {
          root: this.config.legoCacheRoot,
          path: thumbnail,
          contentType: 'image/jpeg',
        }
      : null;
  }

  private async hasSetCover(entry: SetEntry): Promise<boolean> {
    if (await existingFile(entry.cover)) return true;
    if (await existingFile(entry.cachedCover)) return true;
    return Boolean(
      this.config.rebrickableApiKey && /\b\d{3,7}(?:-\d+)?\b/.test(entry.name),
    );
  }

  private async hasMocCover(entry: MocEntry): Promise<boolean> {
    if (await existingFile(entry.cover)) return true;
    return Boolean(await existingFile(entry.path));
  }

  private async thumbnail(moc: MocEntry): Promise<string | null> {
    const metadata = await stat(moc.path).catch(() => null);
    if (!metadata?.isFile()) return null;
    const cacheRoot = join(this.config.legoCacheRoot, 'thumbnails');
    const key = createHash('sha256')
      .update(`${moc.id}:${metadata.size}:${metadata.mtimeMs}`)
      .digest('hex');
    const output = join(cacheRoot, `${key}.jpg`);
    if (await existingFile(output)) return output;
    await mkdir(cacheRoot, { recursive: true }).catch(() => undefined);
    const temporary = join(cacheRoot, `.${key}-${randomUUID()}`);
    try {
      await runPdfToPpm(this.config.pdftoppmPath, moc.path, temporary);
      await rename(`${temporary}.jpg`, output);
      return await existingFile(output);
    } catch {
      return null;
    } finally {
      await rm(`${temporary}.jpg`, { force: true }).catch(() => undefined);
    }
  }

  private async discover(): Promise<SetEntry[]> {
    const root = await realpath(this.root).catch(() => null);
    if (!root) return [];
    const entries = await readdir(root, { withFileTypes: true }).catch(
      () => [],
    );
    const dirs = entries.filter(
      (entry) =>
        entry.isDirectory() &&
        !isHidden(entry.name) &&
        entry.name !== '.wawatube-thumbnails',
    );
    const sets = await Promise.all(
      dirs.map((entry) => this.discoverSet(join(root, entry.name))),
    );
    return sets.filter((entry) => entry.mocs.length > 0);
  }

  private async discoverSet(path: string): Promise<SetEntry> {
    const name = basename(path);
    const relativePath = name;
    return {
      id: opaqueId('set', relativePath),
      name,
      path,
      cover: await findCover(path, name),
      cachedCover: await this.cachedCover(name),
      mocs: await this.discoverMocs(path),
    };
  }

  private async resolveSet(id: string): Promise<SetEntry | null> {
    const segments = decodeId(id, 'set', 1);
    if (!segments) return null;
    const path = await this.safeDirectory(join(this.root, segments[0]!));
    return path ? this.discoverSet(path) : null;
  }

  private async resolveMoc(id: string): Promise<MocEntry | null> {
    const segments = decodeId(id, 'moc', 2);
    if (!segments) return null;
    const setPath = await this.safeDirectory(join(this.root, segments[0]!));
    const mocPath = setPath
      ? await this.safeDirectory(join(setPath, segments[1]!))
      : null;
    if (!setPath || !mocPath) return null;
    const mocs = await this.discoverMocs(setPath);
    return mocs.find((moc) => moc.path.startsWith(`${mocPath}/`)) ?? null;
  }

  private async safeDirectory(path: string): Promise<string | null> {
    const base = await realpath(this.root).catch(() => null);
    const target = await realpath(path).catch(() => null);
    if (!base || !target) return null;
    const name = relative(base, target);
    if (!name || name === '..' || name.startsWith(`..${sep}`)) return null;
    return (await stat(target).catch(() => null))?.isDirectory()
      ? target
      : null;
  }

  private async discoverMocs(path: string): Promise<MocEntry[]> {
    const entries = await readdir(path, { withFileTypes: true }).catch(
      () => [],
    );
    const result: MocEntry[] = [];
    for (const entry of entries) {
      if (isHidden(entry.name) || entry.name === '.wawatube-thumbnails')
        continue;
      const child = join(path, entry.name);
      if (!entry.isDirectory()) continue;
      const pdfs = (
        await readdir(child, { withFileTypes: true }).catch(() => [])
      ).filter((candidate) => candidate.isFile() && isPdf(candidate.name));
      if (pdfs.length !== 1) continue;
      const pdf = join(child, pdfs[0]!.name);
      result.push({
        id: opaqueId('moc', join(basename(path), entry.name)),
        name: basename(child),
        path: pdf,
        cover: await findCover(child, basename(child)),
      });
    }
    return result;
  }

  private async cachedCover(name: string): Promise<string | null> {
    const stem = name.replace(/[^a-z0-9_-]/gi, '_');
    for (const extension of ['.jpg', '.png', '.jpeg']) {
      const path = await existingFile(
        join(this.config.legoCacheRoot, `${stem}${extension}`),
      );
      if (path) return path;
    }
    return null;
  }

  private async fetchRebrickableCover(name: string): Promise<string | null> {
    if (!this.config.rebrickableApiKey) return null;
    const cached = await this.cachedCover(name);
    if (cached) return cached;
    const setNum = name.match(/\b\d{3,7}(?:-\d+)?\b/)?.[0];
    if (!setNum) return null;
    try {
      const response = await fetch(
        `https://rebrickable.com/api/v3/lego/sets/${setNum.includes('-') ? setNum : `${setNum}-1`}/`,
        {
          headers: { Authorization: `key ${this.config.rebrickableApiKey}` },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { set_img_url?: string };
      if (!data.set_img_url) return null;
      const image = await fetch(data.set_img_url, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!image.ok || !image.body) return null;
      await mkdir(this.config.legoCacheRoot, { recursive: true });
      const bytes = Buffer.from(await image.arrayBuffer());
      const extension = imageExtension(bytes);
      if (!extension) return null;
      const stem = name.replace(/[^a-z0-9_-]/gi, '_');
      const path = join(this.config.legoCacheRoot, `${stem}${extension}`);
      const temporary = join(
        this.config.legoCacheRoot,
        `.${stem}-${randomUUID()}${extension}`,
      );
      try {
        await writeFile(temporary, bytes, { flag: 'wx' });
        await rename(temporary, path);
        return await existingFile(path);
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
    } catch {
      return null;
    }
  }
}

function decodeId(
  id: string,
  kind: 'set' | 'moc',
  expectedSegments: number,
): string[] | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(id, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const prefix = `${kind}:`;
  if (
    !decoded.startsWith(prefix) ||
    opaqueId(kind, decoded.slice(prefix.length)) !== id
  )
    return null;
  const segments = decoded.slice(prefix.length).split('/');
  if (
    segments.length !== expectedSegments ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.startsWith('.') ||
        segment.includes('\\'),
    )
  )
    return null;
  return segments;
}

async function findCover(path: string, name: string): Promise<string | null> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  const lower = name.toLowerCase();
  const files = entries.filter(
    (entry) => entry.isFile() && isImage(entry.name),
  );
  const selected = ['portada', 'cover', lower]
    .map((stem) =>
      files.find(
        (entry) =>
          basename(entry.name, extname(entry.name)).toLowerCase() === stem,
      ),
    )
    .find((entry) => entry !== undefined);
  return selected ? join(path, selected.name) : null;
}

function imageType(path: string): string {
  return extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

function imageExtension(bytes: Buffer): '.jpg' | '.png' | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'))
  )
    return '.png';
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return '.jpg';
  return null;
}

function runPdfToPpm(
  command: string,
  input: string,
  output: string,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      command,
      [
        '-f',
        '1',
        '-l',
        '1',
        '-singlefile',
        '-jpeg',
        '-scale-to',
        '640',
        input,
        output,
      ],
      { stdio: 'ignore' },
    );
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('PDF_THUMBNAIL_TIMEOUT'));
    }, 30_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error('PDF_THUMBNAIL_FAILED'));
    });
  });
}
