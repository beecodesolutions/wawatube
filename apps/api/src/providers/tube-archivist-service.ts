import type { MediaMetadata } from './media-provider.js';
import { ProviderError } from './errors.js';
import { ThumbnailCache } from './thumbnail-cache.js';

type MetadataRecord = Record<string, unknown>;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const RESOURCE_ROOTS = ['/media', '/youtube', '/cache/videos'] as const;
const REQUEST_TIMEOUT_MS = 10_000;
const PREFERRED_AUDIO_LANGUAGE = 'es';
const DOWNLOAD_FORMAT = `bv+ba[language^=${PREFERRED_AUDIO_LANGUAGE}]/bv+ba[format_note*=original]/bv+ba/b`;

export class TubeArchivistService {
  private readonly baseUrl: URL;
  private readonly token: string;

  private readonly thumbnails: ThumbnailCache;

  constructor(
    baseUrl: string,
    token: string,
    thumbnailCacheDirectory?: string,
  ) {
    this.thumbnails = new ThumbnailCache(thumbnailCacheDirectory);
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new ProviderError('INVALID_UPSTREAM_URL');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new ProviderError('INVALID_UPSTREAM_URL');
    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    this.baseUrl = parsed;
    this.token = token;
  }

  async preview(
    videoId: string,
  ): Promise<{ taskId: string | null; metadata: MediaMetadata | null }> {
    validateVideoId(videoId);
    const archived = await this.archived(videoId);
    if (archived) return { taskId: null, metadata: archived };
    const response = await this.request('/api/download/?autostart=false', {
      method: 'POST',
      body: JSON.stringify({
        data: [{ youtube_id: videoId, status: 'pending' }],
      }),
    });
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
    const payload = await this.json(response);
    const taskId = typeof payload.task_id === 'string' ? payload.task_id : null;
    return { taskId, metadata: await this.pending(videoId) };
  }

  async startPlaylist(url: string): Promise<string> {
    const response = await this.request('/api/download/?autostart=false', {
      method: 'POST',
      body: JSON.stringify({
        data: [{ youtube_id: url, status: 'pending' }],
      }),
    });
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
    const payload = await this.json(response);
    const taskId = stringValue(payload.task_id);
    if (!taskId) throw new ProviderError('UPSTREAM_INVALID_RESPONSE');
    return taskId;
  }

  async playlistTask(
    taskId: string,
    playlistId: string,
  ): Promise<{
    state: 'PENDING' | 'READY' | 'FAILED';
    title: string | null;
    videoIds: string[];
    lastRefresh: number | null;
  }> {
    const response = await this.request(
      `/api/task/by-id/${encodeURIComponent(taskId)}/`,
      {
        method: 'GET',
      },
    );
    if (response.status === 404)
      return { state: 'PENDING', title: null, videoIds: [], lastRefresh: null };
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
    const payload = await this.json(response);
    const status = payload.status;
    if (status === 'FAILURE' || status === 'REVOKED')
      return { state: 'FAILED', title: null, videoIds: [], lastRefresh: null };
    if (status === 'PENDING' || status === 'STARTED' || status === 'RETRY') {
      try {
        return { state: 'PENDING', ...(await this.playlist(playlistId)) };
      } catch (error) {
        if (
          !(error instanceof ProviderError) ||
          error.code !== 'PLAYLIST_NOT_FOUND'
        )
          throw error;
        return {
          state: 'PENDING',
          title: null,
          videoIds: [],
          lastRefresh: null,
        };
      }
    }
    if (status !== 'SUCCESS')
      throw new ProviderError('UPSTREAM_INVALID_RESPONSE');

    const record = await this.playlist(playlistId);
    return { state: 'READY', ...record };
  }

  async playlist(playlistId: string): Promise<{
    title: string | null;
    videoIds: string[];
    lastRefresh: number | null;
  }> {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(playlistId))
      throw new ProviderError('INVALID_PLAYLIST_ID');
    const response = await this.request(
      `/api/playlist/${encodeURIComponent(playlistId)}/`,
      {
        method: 'GET',
      },
    );
    if (response.status === 404) throw new ProviderError('PLAYLIST_NOT_FOUND');
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
    const payload = await this.json(response);
    const entries = payload.playlist_entries;
    if (!Array.isArray(entries))
      throw new ProviderError('UPSTREAM_INVALID_RESPONSE');
    const lastRefresh =
      typeof payload.playlist_last_refresh === 'number'
        ? payload.playlist_last_refresh
        : typeof payload.playlist_last_refresh === 'string'
          ? Date.parse(payload.playlist_last_refresh) / 1000
          : NaN;
    if (!Number.isFinite(lastRefresh))
      throw new ProviderError('UPSTREAM_INVALID_RESPONSE');
    const videoIds = entries
      .map((entry) =>
        isRecord(entry) && typeof entry.youtube_id === 'string'
          ? entry.youtube_id
          : null,
      )
      .filter(
        (id): id is string => typeof id === 'string' && VIDEO_ID.test(id),
      );
    return {
      title: stringValue(payload.playlist_name),
      videoIds: [...new Set(videoIds)],
      lastRefresh,
    };
  }

  async pending(videoId: string): Promise<MediaMetadata | null> {
    validateVideoId(videoId);
    return this.metadataFrom('/api/download/', videoId);
  }

  async archived(videoId: string): Promise<MediaMetadata | null> {
    validateVideoId(videoId);
    return this.metadataFrom('/api/video/', videoId);
  }

  async queue(videoId: string): Promise<void> {
    validateVideoId(videoId);
    await this.configureAudio();
    const response = await this.request(`/api/download/${videoId}/`, {
      method: 'POST',
      body: JSON.stringify({ status: 'priority' }),
    });
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
  }

  private async configureAudio(): Promise<void> {
    const response = await this.request('/api/appsettings/config/', {
      method: 'GET',
    });
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
    const config = await this.json(response);
    const downloads = config.downloads;
    if (!isRecord(downloads))
      throw new ProviderError('UPSTREAM_INVALID_RESPONSE');
    if (downloads.format === DOWNLOAD_FORMAT) return;

    const updated = await this.request('/api/appsettings/config/', {
      method: 'POST',
      body: JSON.stringify({ downloads: { format: DOWNLOAD_FORMAT } }),
    });
    if (!updated.ok) throw new ProviderError('UPSTREAM_ERROR');
  }

  async failed(videoId: string): Promise<boolean> {
    validateVideoId(videoId);
    const response = await this.request(`/api/download/${videoId}/`, {
      method: 'GET',
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
    const payload = await this.json(response);
    return typeof payload.message === 'string' && payload.message.length > 0;
  }

  async resource(
    path: string,
    headers: { range?: string; ifRange?: string },
    method: 'GET' | 'HEAD' = 'GET',
  ): Promise<Response> {
    const url = this.resourceUrl(path);
    const thumbnailId = url.pathname.match(
      /^\/cache\/videos\/[a-z0-9_-]\/([A-Za-z0-9_-]{11})\.jpg$/,
    )?.[1];
    if (thumbnailId && !headers.range) {
      const image = await this.thumbnails.get(thumbnailId, () =>
        this.request(url, { method: 'GET' }),
      );
      return method === 'HEAD'
        ? new Response(null, { headers: image.headers })
        : image;
    }
    const response = await this.request(url, {
      method,
      headers: {
        Accept: '*/*',
        ...(headers.range ? { Range: headers.range } : {}),
        ...(headers.ifRange ? { 'If-Range': headers.ifRange } : {}),
      },
    });
    if (response.status >= 300 && response.status < 400)
      throw new ProviderError('UPSTREAM_REDIRECT');
    return response;
  }

  async metadataResource(
    videoId: string,
  ): Promise<{ mediaPath: string; thumbnailPath: string | null }> {
    const metadata = await this.rawMetadata('/api/video/', videoId);
    if (!metadata) throw new ProviderError('NOT_FOUND');
    const mediaPath = stringValue(metadata.media_url);
    if (!mediaPath) throw new ProviderError('MEDIA_UNAVAILABLE');
    this.resourceUrl(mediaPath);
    const thumbnail = stringValue(metadata.vid_thumb_url);
    if (thumbnail) this.resourceUrl(thumbnail);
    return { mediaPath, thumbnailPath: thumbnail };
  }

  private async metadataFrom(
    prefix: string,
    videoId: string,
  ): Promise<MediaMetadata | null> {
    const payload = await this.rawMetadata(prefix, videoId);
    if (!payload) return null;
    const title = stringValue(payload.title);
    return {
      title: title || videoId,
      description: stringValue(payload.description),
      durationSeconds: durationSeconds(
        payload.duration ?? nestedValue(payload, ['player', 'duration']),
      ),
      thumbnailRef: stringValue(payload.vid_thumb_url),
    };
  }

  private async rawMetadata(
    prefix: string,
    videoId: string,
  ): Promise<MetadataRecord | null> {
    validateVideoId(videoId);
    const response = await this.request(`${prefix}${videoId}/`, {
      method: 'GET',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new ProviderError('UPSTREAM_ERROR');
    const payload = await this.json(response);
    return isRecord(payload) ? payload : null;
  }

  private resourceUrl(path: string): URL {
    const rawPath = path.match(/^(?:https?:\/\/[^/]+)?([^?#]*)/)?.[1] ?? '';
    try {
      if (
        decodeURIComponent(rawPath)
          .split('/')
          .some((part) => part === '..')
      )
        throw new ProviderError('INVALID_RESOURCE');
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('INVALID_RESOURCE');
    }
    let url: URL;
    try {
      url = new URL(path, this.baseUrl);
    } catch {
      throw new ProviderError('INVALID_RESOURCE');
    }
    if (url.origin !== this.baseUrl.origin || url.username || url.password)
      throw new ProviderError('INVALID_RESOURCE');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new ProviderError('INVALID_RESOURCE');
    }
    const allowed = RESOURCE_ROOTS.some(
      (root) => pathname === root || pathname.startsWith(`${root}/`),
    );
    if (!allowed || pathname.split('/').some((part) => part === '..'))
      throw new ProviderError('INVALID_RESOURCE');
    return url;
  }

  private async request(
    path: string | URL,
    init: RequestInit,
  ): Promise<Response> {
    let url: URL;
    try {
      url = path instanceof URL ? path : new URL(path, this.baseUrl);
    } catch {
      throw new ProviderError('INVALID_UPSTREAM_URL');
    }
    if (url.origin !== this.baseUrl.origin)
      throw new ProviderError('INVALID_UPSTREAM_URL');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(typeof init.body === 'string'
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(this.token ? { Authorization: `Token ${this.token}` } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new ProviderError('UPSTREAM_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async json(response: Response): Promise<MetadataRecord> {
    try {
      const payload: unknown = await response.json();
      return isRecord(payload) ? payload : {};
    } catch {
      throw new ProviderError('UPSTREAM_INVALID_RESPONSE');
    }
  }
}

const validateVideoId = (videoId: string): void => {
  if (!VIDEO_ID.test(videoId)) throw new ProviderError('INVALID_VIDEO_ID');
};

const isRecord = (value: unknown): value is MetadataRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const nestedValue = (record: MetadataRecord, path: string[]): unknown =>
  path.reduce<unknown>(
    (value, key) => (isRecord(value) ? value[key] : undefined),
    record,
  );

const durationSeconds = (value: unknown): number | null => {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const units = text.match(
    /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i,
  );
  if (units && (units[1] || units[2] || units[3])) {
    const seconds =
      Number(units[1] ?? 0) * 3600 +
      Number(units[2] ?? 0) * 60 +
      Number(units[3] ?? 0);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const parts = text.split(':');
  if (!parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.length > 3 || numbers.length === 0) return null;
  const seconds = numbers.reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(seconds) ? seconds : null;
};
