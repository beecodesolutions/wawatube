import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  mkdir,
  realpath,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
import type { LocalCandidate } from '@wawatube/shared';
import type {
  MediaMetadata,
  MediaProvider,
  MediaResource,
} from './media-provider.js';
import { ProviderError } from './errors.js';

const EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov']);
const IMAGE_EXTENSIONS = ['.jpg', '.png'] as const;
const GENERATED_THUMBNAIL_DIRECTORY = '.wawatube-thumbnails';

type ProbeResult = {
  format?: {
    filename?: string;
    duration?: string | number;
    tags?: { title?: string; description?: string };
  };
};

const probe = (command: string, file: string): Promise<string> =>
  new Promise((resolveOutput, reject) => {
    execFile(
      command,
      ['-v', 'error', '-print_format', 'json', '-show_format', file],
      { encoding: 'utf8', timeout: 5_000, maxBuffer: 1_000_000 },
      (error, stdout) =>
        error ? reject(error) : resolveOutput(String(stdout)),
    );
  });

const generateFrame = (
  command: string,
  input: string,
  output: string,
): Promise<void> =>
  new Promise((resolveOutput, reject) => {
    execFile(
      command,
      ['-v', 'error', '-y', '-i', input, '-frames:v', '1', '-q:v', '2', output],
      { timeout: 15_000, maxBuffer: 1_000_000 },
      (error) => (error ? reject(error) : resolveOutput()),
    );
  });

export class LocalMediaProvider implements MediaProvider {
  readonly sourceType = 'LOCAL' as const;
  private readonly root: string;
  private readonly ffprobePath: string;
  private readonly ffmpegPath: string;
  private readonly thumbnailJobs = new Map<string, Promise<string | null>>();

  constructor(root: string, ffprobePath = 'ffprobe', ffmpegPath = 'ffmpeg') {
    this.root = resolve(root);
    this.ffprobePath = ffprobePath;
    this.ffmpegPath = ffmpegPath;
  }

  async discover(): Promise<LocalCandidate[]> {
    const root = await this.rootPath();
    const candidates: LocalCandidate[] = [];
    const walk = async (directory: string, prefix: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name);
        const sourceId = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(absolute, sourceId);
        } else if (
          EXTENSIONS.has(extname(entry.name).toLowerCase()) &&
          (await this.isInsideRegularFile(root, absolute))
        ) {
          candidates.push({
            sourceId,
            title: entry.name.slice(0, -extname(entry.name).length),
          });
        }
      }
    };
    await walk(root, '');
    return candidates.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }

  async metadata(sourceId: string): Promise<MediaMetadata> {
    const id = normalizeSourceId(sourceId);
    const file = await this.filePath(id);
    let parsed: ProbeResult;
    try {
      parsed = JSON.parse(await probe(this.ffprobePath, file)) as ProbeResult;
    } catch {
      throw new ProviderError('METADATA_UNAVAILABLE');
    }
    const format = parsed.format ?? {};
    const fallback = id.split('/').pop() ?? id;
    const title =
      format.tags?.title?.trim() || fallback.replace(/\.[^.]+$/, '');
    const duration = Number(format.duration);
    return {
      title,
      description: format.tags?.description ?? null,
      durationSeconds:
        Number.isFinite(duration) && duration >= 0 ? duration : null,
      thumbnailRef: await this.thumbnailId(id, file),
    };
  }

  async available(sourceId: string): Promise<boolean> {
    try {
      await this.filePath(normalizeSourceId(sourceId));
      return true;
    } catch (error) {
      if (
        error instanceof ProviderError &&
        ['NOT_FOUND', 'INVALID_SOURCE', 'MEDIA_ROOT_UNAVAILABLE'].includes(
          error.code,
        )
      )
        return false;
      throw error;
    }
  }

  async playback(sourceId: string): Promise<MediaResource> {
    const id = normalizeSourceId(sourceId);
    await this.filePath(id);
    return { kind: 'file', root: this.root, relativePath: id };
  }

  async thumbnail(sourceId: string): Promise<MediaResource | null> {
    const id = normalizeSourceId(sourceId);
    const file = await this.filePath(id);
    const thumbnail = await this.thumbnailId(id, file);
    return thumbnail
      ? { kind: 'file', root: this.root, relativePath: thumbnail }
      : null;
  }

  private async rootPath(): Promise<string> {
    try {
      return await realpath(this.root);
    } catch {
      throw new ProviderError('MEDIA_ROOT_UNAVAILABLE');
    }
  }

  private async filePath(sourceId: string): Promise<string> {
    if (!EXTENSIONS.has(extname(sourceId).toLowerCase()))
      throw new ProviderError('INVALID_SOURCE');
    const root = await this.rootPath();
    const file = join(root, sourceId.split('/').join(sep));
    if (!(await this.isInsideRegularFile(root, file)))
      throw new ProviderError('NOT_FOUND');
    return file;
  }

  private async isInsideRegularFile(
    root: string,
    file: string,
  ): Promise<boolean> {
    try {
      const target = await realpath(file);
      const rel = relative(root, target);
      if (rel === '' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        return false;
      return (await stat(target)).isFile();
    } catch {
      return false;
    }
  }

  private async thumbnailId(
    sourceId: string,
    file: string,
  ): Promise<string | null> {
    const withoutExtension = sourceId.slice(0, -extname(sourceId).length);
    for (const extension of IMAGE_EXTENSIONS) {
      const candidate = `${withoutExtension}${extension}`;
      if (await this.filePathIfSafe(candidate)) return candidate;
    }
    const generated = `${GENERATED_THUMBNAIL_DIRECTORY}/${withoutExtension}.jpg`;
    if (await this.filePathIfSafe(generated)) return generated;
    let job = this.thumbnailJobs.get(sourceId);
    if (!job) {
      job = this.generateThumbnail(file, generated);
      this.thumbnailJobs.set(sourceId, job);
    }
    try {
      return await job;
    } finally {
      if (this.thumbnailJobs.get(sourceId) === job)
        this.thumbnailJobs.delete(sourceId);
    }
  }

  private async generateThumbnail(
    input: string,
    relativePath: string,
  ): Promise<string | null> {
    let temporary: string | undefined;
    try {
      const root = await this.rootPath();
      const output = join(root, relativePath.split('/').join(sep));
      const directory = dirname(output);
      await mkdir(directory, { recursive: true });
      const outputDirectory = await realpath(directory);
      const cacheRelative = relative(root, outputDirectory);
      if (
        !cacheRelative ||
        cacheRelative.startsWith(`..${sep}`) ||
        isAbsolute(cacheRelative)
      )
        return null;
      temporary = `${output}.tmp-${randomUUID()}.jpg`;
      await generateFrame(this.ffmpegPath, input, temporary);
      await rename(temporary, output);
      temporary = undefined;
      return (await this.filePathIfSafe(relativePath)) ? relativePath : null;
    } catch {
      return null;
    } finally {
      if (temporary) await unlink(temporary).catch(() => undefined);
    }
  }

  private async filePathIfSafe(sourceId: string): Promise<boolean> {
    try {
      return await this.isInsideRegularFile(
        await this.rootPath(),
        join(this.root, sourceId.split('/').join(sep)),
      );
    } catch {
      return false;
    }
  }
}

const normalizeSourceId = (sourceId: string): string => {
  if (
    !sourceId ||
    sourceId.includes('\\') ||
    sourceId.includes('\0') ||
    isAbsolute(sourceId)
  ) {
    throw new ProviderError('INVALID_SOURCE');
  }
  const parts = sourceId.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..'))
    throw new ProviderError('INVALID_SOURCE');
  const normalized = posix.normalize(sourceId);
  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  )
    throw new ProviderError('INVALID_SOURCE');
  return normalized;
};
