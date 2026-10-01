import type { ChildMedia, LocalCandidate, SourceType } from '@wawatube/shared';
import type {
  MediaMetadata,
  MediaProvider,
  MediaResource,
} from './providers/media-provider.js';

export interface MediaGateway {
  metadata(sourceType: SourceType, sourceId: string): Promise<MediaMetadata>;
  available(sourceType: SourceType, sourceId: string): Promise<boolean>;
  playback(sourceType: SourceType, sourceId: string): Promise<MediaResource>;
  thumbnail(
    sourceType: SourceType,
    sourceId: string,
  ): Promise<MediaResource | null>;
  localCandidates(): Promise<LocalCandidate[]>;
  previewYoutube(sourceId: string): Promise<MediaMetadata | null>;
  queueYoutube(sourceId: string): Promise<void>;
  youtubeState(
    sourceId: string,
  ): Promise<'READY' | 'QUEUED' | 'FAILED' | 'PENDING'>;
  reconcileYoutube(sourceId: string): Promise<{
    metadata: MediaMetadata | null;
    available: boolean;
    failed: boolean;
  }>;
  upstream(
    path: string,
    headers?: { range?: string; ifRange?: string },
    method?: 'GET' | 'HEAD',
  ): Promise<Response>;
}

export class ProviderMediaGateway implements MediaGateway {
  constructor(
    private readonly providers: Record<SourceType, MediaProvider>,
    private readonly youtube: {
      preview(id: string): Promise<{ metadata: MediaMetadata | null }>;
      queue(id: string): Promise<void>;
      state(id: string): Promise<'READY' | 'QUEUED' | 'FAILED' | 'PENDING'>;
      reconcile(id: string): Promise<{
        metadata: MediaMetadata | null;
        available: boolean;
        failed: boolean;
      }>;
    },
    private readonly candidates: () => Promise<LocalCandidate[]>,
    private readonly resource: (
      path: string,
      headers?: { range?: string; ifRange?: string },
      method?: 'GET' | 'HEAD',
    ) => Promise<Response>,
  ) {}
  metadata(type: SourceType, id: string) {
    return this.providers[type].metadata(id);
  }
  available(type: SourceType, id: string) {
    return this.providers[type].available(id);
  }
  playback(type: SourceType, id: string) {
    return this.providers[type].playback(id);
  }
  thumbnail(type: SourceType, id: string) {
    return this.providers[type].thumbnail(id);
  }
  localCandidates() {
    return this.candidates();
  }
  async previewYoutube(id: string) {
    return (await this.youtube.preview(id)).metadata;
  }
  queueYoutube(id: string) {
    return this.youtube.queue(id);
  }
  youtubeState(id: string) {
    return this.youtube.state(id);
  }
  reconcileYoutube(id: string) {
    return this.youtube.reconcile(id);
  }
  upstream(
    path: string,
    headers: { range?: string; ifRange?: string } = {},
    method: 'GET' | 'HEAD' = 'GET',
  ) {
    return this.resource(path, headers, method);
  }
}

export const childMedia = (row: {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  thumbnailRef?: string | null;
}): ChildMedia => ({
  id: row.id,
  title: row.title,
  description: row.description,
  durationSeconds: row.durationSeconds,
  thumbnailUrl: row.thumbnailRef ? `/api/kids/media/${row.id}/thumbnail` : null,
  playbackUrl: `/api/kids/media/${row.id}/play`,
});
