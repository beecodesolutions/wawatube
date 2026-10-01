import type {
  MediaMetadata,
  MediaProvider,
  MediaResource,
} from './media-provider.js';
import { ProviderError } from './errors.js';
import { TubeArchivistService } from './tube-archivist-service.js';

export class YouTubeMediaProvider implements MediaProvider {
  readonly sourceType = 'YOUTUBE' as const;
  private readonly service: TubeArchivistService;

  constructor(service: TubeArchivistService) {
    this.service = service;
  }

  async metadata(sourceId: string): Promise<MediaMetadata> {
    const metadata =
      (await this.service.archived(sourceId)) ??
      (await this.service.pending(sourceId));
    if (!metadata) throw new ProviderError('NOT_FOUND');
    return metadata;
  }

  async available(sourceId: string): Promise<boolean> {
    try {
      const resource = await this.service.metadataResource(sourceId);
      const response = await this.service.resource(
        resource.mediaPath,
        {},
        'HEAD',
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async playback(sourceId: string): Promise<MediaResource> {
    const resource = await this.service.metadataResource(sourceId);
    return { kind: 'upstream', path: resource.mediaPath };
  }

  async thumbnail(sourceId: string): Promise<MediaResource | null> {
    const metadata = await this.metadata(sourceId);
    return metadata.thumbnailRef
      ? { kind: 'upstream', path: metadata.thumbnailRef }
      : null;
  }
}

export const youtubeIdFromUrl = (input: string): string => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ProviderError('INVALID_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new ProviderError('INVALID_URL');
  const hostname = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (hostname === 'youtu.be') {
    candidate = url.pathname.slice(1).split('/')[0] ?? null;
  } else if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
    ].includes(hostname)
  ) {
    candidate = url.searchParams.get('v');
    const segments = url.pathname.split('/').filter(Boolean);
    if (!candidate && ['shorts', 'embed', 'live'].includes(segments[0] ?? ''))
      candidate = segments[1] ?? null;
  }
  if (!candidate || !/^[A-Za-z0-9_-]{11}$/.test(candidate))
    throw new ProviderError('INVALID_URL');
  return candidate;
};

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);
const PLAYLIST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export const youtubePlaylistIdFromUrl = (input: string): string => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ProviderError('INVALID_URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new ProviderError('INVALID_URL');
  const hostname = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) throw new ProviderError('INVALID_URL');
  if (
    hostname !== 'youtu.be' &&
    !['/watch', '/playlist'].includes(url.pathname)
  )
    throw new ProviderError('INVALID_URL');
  const playlistId = url.searchParams.get('list');
  if (!playlistId || !PLAYLIST_ID.test(playlistId))
    throw new ProviderError('INVALID_URL');
  return playlistId;
};
