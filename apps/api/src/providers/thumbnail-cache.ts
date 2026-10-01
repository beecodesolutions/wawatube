import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProviderError } from './errors.js';

// TubeArchivist v0.5.12 saves this generic artwork as a successful JPEG.
const PLACEHOLDER_SHA256 =
  '4a4801060622dc7a98ee49e7ea0198fdc889d4e01333c3937102a4e712984d1d';

export class ThumbnailCache {
  private readonly pending = new Map<string, Promise<Buffer>>();

  constructor(private readonly directory?: string) {}

  async get(id: string, original: () => Promise<Response>): Promise<Response> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id))
      throw new ProviderError('INVALID_VIDEO_ID');
    let pending = this.pending.get(id);
    if (!pending) {
      pending = this.load(id, original);
      this.pending.set(id, pending);
    }
    try {
      return new Response(new Uint8Array(await pending), {
        headers: {
          'content-type': 'image/jpeg',
          'cache-control': 'private, max-age=86400',
        },
      });
    } finally {
      if (this.pending.get(id) === pending) this.pending.delete(id);
    }
  }

  private async load(
    id: string,
    original: () => Promise<Response>,
  ): Promise<Buffer> {
    const file = this.directory ? join(this.directory, `${id}.jpg`) : null;
    if (file) {
      try {
        const cached = await readFile(file);
        if (validThumbnail(cached)) return cached;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          console.warn('Thumbnail cache read failed', error);
      }
    }
    try {
      const response = await original();
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (validThumbnail(bytes)) return bytes;
      } else {
        await response.body?.cancel();
      }
    } catch {
      // An unavailable archive can still recover from the public image CDN.
    }
    // Fixed host and validated ID: never forward the archive token or a supplied URL.
    const response = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, {
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      throw new ProviderError('THUMBNAIL_UNAVAILABLE');
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError('THUMBNAIL_UNAVAILABLE');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!validThumbnail(bytes))
      throw new ProviderError('THUMBNAIL_UNAVAILABLE');
    if (file && this.directory) {
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(`${file}.tmp`, bytes);
        await rename(`${file}.tmp`, file);
      } catch (error) {
        console.warn('Thumbnail cache write failed', error);
      }
    }
    return bytes;
  }
}

function validThumbnail(bytes: Buffer): boolean {
  return (
    bytes.length > 3 &&
    bytes.length <= 2_000_000 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    createHash('sha256').update(bytes).digest('hex') !== PLACEHOLDER_SHA256
  );
}
