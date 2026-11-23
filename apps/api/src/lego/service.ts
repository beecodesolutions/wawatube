import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  link,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants, createReadStream } from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { spawn } from 'node:child_process';
import { eq, inArray, sql } from 'drizzle-orm';
import type {
  LegoAdminSettings,
  LegoCandidate,
  LegoImportItem,
  LegoMoc,
  LegoSet,
} from '@wawatube/shared';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/index.js';
import { legoMocProgress, legoSettings } from '../db/schema.js';

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
interface Alternate {
  setId: string;
  mocId: string;
  name: string;
  imageUrl?: string;
}

interface MocEntry {
  setId: string;
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
const defaultInbox = (config: { legoInbox?: string }) =>
  resolve(
    config.legoInbox ?? join(process.env.HOME ?? '', 'Desktop/tiradero/lego'),
  );
const pdfName = (name: string) => extname(name).toLowerCase() === '.pdf';
const setNamePattern = /^[^./\\][^/\\]{0,199}$/u;

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

export class LegoPathError extends Error {
  constructor() {
    super('INVALID_LEGO_PATH');
  }
}

export class LegoInboxUnavailableError extends Error {
  constructor() {
    super('LEGO_INBOX_UNAVAILABLE');
  }
}

export class LegoService {
  private readonly root: string;
  private readonly inboxDefault: string;
  constructor(
    private readonly db: Database,
    private readonly config: Pick<
      AppConfig,
      'legoMediaRoot' | 'legoCacheRoot' | 'rebrickableApiKey' | 'pdftoppmPath'
    > & { legoInbox?: string },
  ) {
    this.root = resolve(config.legoMediaRoot);
    this.inboxDefault = defaultInbox(config);
  }

  async settings(
    db: Pick<Database, 'select'> = this.db,
  ): Promise<LegoAdminSettings> {
    const rows = await db
      .select()
      .from(legoSettings)
      .where(eq(legoSettings.id, 1));
    const inbox = rows[0]?.inbox ?? this.inboxDefault;
    return {
      inbox,
      catalog: this.root,
      apiKeyConfigured: Boolean(this.config.rebrickableApiKey),
      sets: await this.catalogSets(),
    };
  }

  async setInbox(inbox: string): Promise<LegoAdminSettings> {
    if (!isAbsolute(inbox) || inbox.length > 4096) throw new LegoPathError();
    const normalized = resolve(inbox);
    const target = await this.safeRoot(normalized);
    const catalog = await this.safeRoot(this.root);
    if (!target || !catalog || rootsOverlap(target, catalog))
      throw new LegoInboxUnavailableError();
    await this.ensureReadable(normalized);
    await this.db
      .insert(legoSettings)
      .values({ id: 1, inbox: normalized })
      .onConflictDoUpdate({
        target: legoSettings.id,
        set: { inbox: normalized, updatedAt: new Date() },
      });
    return this.settings();
  }

  async scan(): Promise<{ candidates: LegoCandidate[] }> {
    const settings = await this.settings();
    const inbox = await this.safeRoot(settings.inbox);
    const catalog = await this.safeRoot(this.root);
    if (!inbox || !catalog || rootsOverlap(inbox, catalog))
      throw new LegoInboxUnavailableError();
    await this.ensureReadable(inbox);
    await this.ensureReadable(catalog);
    const hashes = await this.catalogHashes(catalog);
    const pending: { file: string; parsed: ParsedCandidate }[] = [];
    await this.walkPdfFiles(inbox, async (path) => {
      const file = relative(inbox, path).split(sep).join('/');
      const parsed = parseCandidateName(basename(path));
      const hash = await sha256(path);
      if (hashes.has(hash)) return;
      pending.push({ file, parsed });
    });
    const hasUnseenId = pending.some(({ parsed }) => parsed.mocId !== null);
    const alternateMap = hasUnseenId
      ? await this.alternateMap(settings.sets.map((s) => s.id))
      : new Map<string, { setId: string; mocId: string; name: string }>();
    const candidates: LegoCandidate[] = [];
    const usedNames = new Map<string, Set<string>>();
    for (const item of pending) {
      const match = matchSet(
        item.parsed.mocId,
        item.parsed.tokens,
        settings.sets,
        alternateMap,
      );
      const setId = match?.setId ?? null;
      const preferredName = match?.name || item.parsed.name || 'Construcción';
      const name = await uniqueCandidateName(
        preferredName,
        setId,
        usedNames,
        (candidate) =>
          setId ? this.mocHasPdf(setId, candidate) : Promise.resolve(false),
      );
      const mocId = match?.mocId ?? item.parsed.mocId;
      candidates.push({ file: item.file, mocId, name, setId });
    }
    candidates.sort((a, b) => a.file.localeCompare(b.file));
    return { candidates };
  }

  async import(
    items: LegoImportItem[],
  ): Promise<{ imported: number; skipped: number }> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(824732)`);
      return this.importFiles(items, await this.settings(tx));
    });
  }

  private async importFiles(
    items: LegoImportItem[],
    settings: LegoAdminSettings,
  ): Promise<{ imported: number; skipped: number }> {
    const inbox = await this.safeRoot(settings.inbox);
    const catalog = await this.safeRoot(this.root);
    if (!inbox || !catalog || rootsOverlap(inbox, catalog))
      throw new LegoInboxUnavailableError();
    await this.ensureReadable(inbox);
    await this.ensureReadable(catalog);
    const hashes = await this.catalogHashes(catalog);
    const knownSets = new Set(settings.sets.map((set) => set.id));
    let imported = 0;
    let skipped = 0;
    for (const item of items) {
      const source = await this.safeInboxFile(inbox, item.file);
      if (!source || !pdfName(source)) {
        skipped++;
        continue;
      }
      const setId = safeSegment(item.setId);
      const name = safeSegment(item.name);
      if (!setId || !name || !knownSets.has(setId)) {
        skipped++;
        continue;
      }
      const sourceHash = await sha256(source);
      if (hashes.has(sourceHash)) {
        skipped++;
        continue;
      }
      const mocDirectory = join(catalog, setId, name);
      if (await this.mocHasPdf(setId, name)) {
        skipped++;
        continue;
      }
      const parent = await this.safeCatalogDirectory(
        catalog,
        mocDirectory,
        true,
      );
      if (!parent) {
        skipped++;
        continue;
      }
      const target = join(parent, basename(source));
      if (await existingFile(target)) {
        skipped++;
        continue;
      }
      const copied = await copyAtomic(source, target);
      if (!copied) {
        skipped++;
        continue;
      }
      hashes.add(sourceHash);
      imported++;
    }
    return { imported, skipped };
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

  private async catalogSets(): Promise<{ id: string; name: string }[]> {
    const root = await this.safeRoot(this.root);
    if (!root) return [];
    const entries = await readdir(root, { withFileTypes: true }).catch(
      () => [],
    );
    return entries
      .filter((entry) => entry.isDirectory() && !isHidden(entry.name))
      .map((entry) => ({ id: entry.name, name: entry.name }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private async safeRoot(path: string): Promise<string | null> {
    const target = await realpath(resolve(path)).catch(() => null);
    if (!target) return null;
    return (await stat(target).catch(() => null))?.isDirectory()
      ? target
      : null;
  }

  private async ensureReadable(path: string): Promise<void> {
    try {
      await readdir(path);
    } catch {
      throw new LegoInboxUnavailableError();
    }
  }

  private async safeInboxFile(
    root: string,
    input: string,
  ): Promise<string | null> {
    if (!input || input.length > 4096) return null;
    const target = await realpath(
      isAbsolute(input) ? input : resolve(root, input),
    ).catch(() => null);
    if (!target || !inside(root, target)) return null;
    return (await stat(target).catch(() => null))?.isFile() ? target : null;
  }

  private async safeCatalogDirectory(
    catalog: string,
    requested: string,
    create: boolean,
  ): Promise<string | null> {
    if (!inside(catalog, requested)) return null;
    const segments = relative(catalog, requested).split(sep);
    let current = catalog;
    for (const segment of segments) {
      current = join(current, segment);
      const existing = await realpath(current).catch(() => null);
      if (existing) {
        if (!inside(catalog, existing)) return null;
        if (!(await stat(existing).catch(() => null))?.isDirectory())
          return null;
        current = existing;
      } else if (create) {
        await mkdir(current).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        });
      } else {
        return null;
      }
    }
    const target = await realpath(current).catch(() => null);
    return target &&
      inside(catalog, target) &&
      (await stat(target).catch(() => null))?.isDirectory()
      ? target
      : null;
  }

  private async walkPdfFiles(
    root: string,
    callback: (path: string) => Promise<void>,
  ): Promise<void> {
    const walk = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        () => [],
      );
      for (const entry of entries) {
        if (isHidden(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
        } else if (entry.isFile() && pdfName(entry.name)) {
          const safe = await this.safeInboxFile(root, path);
          if (safe) await callback(safe);
        }
      }
    };
    await walk(root);
  }

  private async mocHasPdf(setId: string, name: string): Promise<boolean> {
    const set = safeSegment(setId);
    const moc = safeSegment(name);
    if (!set || !moc) return false;
    const catalog = await this.safeRoot(this.root);
    if (!catalog) return false;
    const directory = await this.safeCatalogDirectory(
      catalog,
      join(catalog, set, moc),
      false,
    );
    if (!directory) return false;
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      if (!entry.isFile() || !pdfName(entry.name)) continue;
      const path = await realpath(join(directory, entry.name)).catch(
        () => null,
      );
      if (path && inside(catalog, path)) return true;
    }
    return false;
  }

  private async catalogHashes(catalog: string): Promise<Set<string>> {
    const hashes = new Set<string>();
    await this.walkPdfFiles(catalog, async (path) => {
      const hash = await sha256(path);
      hashes.add(hash);
    });
    return hashes;
  }

  private readonly mocAlternates = new Map<
    string,
    { expires: number; entries: Promise<Map<string, Alternate>> }
  >();

  private async alternateMap(
    setIds: string[],
  ): Promise<Map<string, Alternate>> {
    const result = new Map<string, Alternate>();
    if (!this.config.rebrickableApiKey) return result;
    for (const setId of setIds) {
      const apiSet = setId.includes('-') ? setId : `${setId}-1`;
      let next: string | null =
        `https://rebrickable.com/api/v3/lego/sets/${encodeURIComponent(apiSet)}/alternates/?page_size=100`;
      let pages = 0;
      while (next && pages++ < 100) {
        const page = await this.rebrickablePage(next);
        if (!page) break;
        for (const alternate of page.results) {
          const token = alternate.set_num.trim();
          if (!token) continue;
          result.set(token.toLowerCase(), {
            setId,
            mocId: token,
            name: alternate.name.trim() || token,
            imageUrl:
              typeof alternate.moc_img_url === 'string'
                ? alternate.moc_img_url
                : undefined,
          });
          if (!/^MOC[-_ ]?\d+$/i.test(token)) {
            const base = token.split('-')[0];
            if (base)
              result.set(base.toLowerCase(), {
                setId,
                mocId: token,
                name: alternate.name.trim() || token,
              });
          }
        }
        next = page.next;
      }
    }
    return result;
  }

  private async rebrickablePage(url: string): Promise<{
    results: { set_num: string; name: string; moc_img_url?: unknown }[];
    next: string | null;
  } | null> {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        !['rebrickable.com', 'www.rebrickable.com'].includes(parsed.hostname)
      )
        return null;
      const response = await fetch(parsed, {
        headers: { Authorization: `key ${this.config.rebrickableApiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return null;
      const value = (await response.json()) as {
        results?: unknown;
        next?: unknown;
      };
      const results = Array.isArray(value.results)
        ? value.results.filter(
            (item): item is { set_num: string; name: string } =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as { set_num?: unknown }).set_num === 'string' &&
              typeof (item as { name?: unknown }).name === 'string',
          )
        : [];
      const next = typeof value.next === 'string' ? value.next : null;
      return { results, next };
    } catch {
      return null;
    }
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
    if (!('setId' in entry)) return null;
    const remote = await this.rebrickableMocCover(entry);
    if (remote)
      return {
        root: this.config.legoCacheRoot,
        path: remote,
        contentType: imageType(remote),
      };
    const thumbnail = await this.thumbnail(entry);
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
        setId: basename(path),
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

  private async rebrickableMocCover(moc: MocEntry): Promise<string | null> {
    const { mocId } = parseCandidateName(basename(moc.path));
    if (!mocId) return null;
    const cached = await this.cachedCover(mocId);
    if (cached || !this.config.rebrickableApiKey) return cached;
    let lookup = this.mocAlternates.get(moc.setId);
    if (!lookup || lookup.expires <= Date.now()) {
      lookup = {
        expires: Date.now() + 5 * 60_000,
        entries: this.alternateMap([moc.setId]),
      };
      this.mocAlternates.set(moc.setId, lookup);
    }
    const imageUrl = (await lookup.entries).get(mocId.toLowerCase())?.imageUrl;
    if (!imageUrl) return null;
    try {
      const image = new URL(imageUrl);
      if (image.protocol !== 'https:' || image.host !== 'cdn.rebrickable.com')
        return null;
      return await this.cacheRebrickableImage(mocId, image, 'error');
    } catch {
      return null;
    }
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
      return await this.cacheRebrickableImage(name, data.set_img_url);
    } catch {
      return null;
    }
  }

  private async cacheRebrickableImage(
    name: string,
    url: string | URL,
    redirect: RequestRedirect = 'follow',
  ): Promise<string | null> {
    const image = await fetch(url, {
      redirect,
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

interface ParsedCandidate {
  name: string;
  tokens: string[];
  mocId: string | null;
}

function normalizeMocId(value: string): string {
  return value.toUpperCase().replace(/^MOC[-_ ]*/, 'MOC-');
}

function parseCandidateName(file: string): ParsedCandidate {
  const stem = basename(file, extname(file)).replace(/_/g, ' ');
  const mocMatch = stem.match(/MOC[-_ ]?\d+/i);
  const mocId = mocMatch ? normalizeMocId(mocMatch[0]!) : null;
  const withoutMoc = mocMatch ? stem.replace(mocMatch[0]!, '') : stem;
  const tokens = [...withoutMoc.matchAll(/\b\d{3,7}(?:-\d+)?\b/g)].map(
    (match) => match[0]!,
  );
  const name = stem
    .replace(/MOC[-_ ]?\d+/gi, '')
    .replace(/\b\d{3,7}(?:-\d+)?\b/g, '')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, tokens, mocId };
}

function matchSet(
  mocId: string | null,
  tokens: string[],
  sets: { id: string; name: string }[],
  alternates: Map<string, { setId: string; mocId: string; name: string }>,
): { setId: string; mocId: string | null; name: string } | null {
  const byId = new Map(sets.map((set) => [set.id.toLowerCase(), set]));
  if (mocId) {
    const alternate = alternates.get(mocId.toLowerCase());
    if (alternate) return alternate;
  }
  for (const token of tokens) {
    if (token.includes('-') && token.split('-').at(-1) !== '1') {
      const alternate = alternates.get(token.toLowerCase());
      if (alternate) return alternate;
    }
    const direct =
      byId.get(token.toLowerCase()) ??
      byId.get(token.split('-')[0]!.toLowerCase());
    if (direct) return { setId: direct.id, mocId: null, name: '' };
    const alternate = alternates.get(token.toLowerCase());
    if (alternate) return alternate;
  }
  return null;
}

async function uniqueCandidateName(
  name: string,
  setId: string | null,
  used: Map<string, Set<string>>,
  exists: (name: string) => Promise<boolean>,
): Promise<string> {
  const clean = name.trim() || 'Construcción';
  const key = setId ?? '';
  const names = used.get(key) ?? new Set<string>();
  used.set(key, names);
  let candidate = clean;
  let suffix = 2;
  while (names.has(candidate) || (await exists(candidate)))
    candidate = `${clean} (${suffix++})`;
  names.add(candidate);
  return candidate;
}

function safeSegment(value: string): string | null {
  const clean = value.trim();
  return setNamePattern.test(clean) && clean !== '..' ? clean : null;
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path !== '' &&
    path !== '..' &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

function rootsOverlap(first: string, second: string): boolean {
  return first === second || inside(first, second) || inside(second, first);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function copyAtomic(source: string, target: string): Promise<boolean> {
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    let attempt = 0;
    while (true) {
      try {
        await copyFile(source, temporary, fsConstants.COPYFILE_EXCL);
        break;
      } catch (error) {
        if (attempt++ >= 2 || !retryable(error)) throw error;
      }
    }
    try {
      await link(temporary, target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function retryable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return ['EAGAIN', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE', 'ETXTBSY'].includes(
    code ?? '',
  );
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
