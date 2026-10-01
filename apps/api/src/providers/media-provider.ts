import type { SourceType } from '@wawatube/shared';

export interface MediaMetadata {
  title: string;
  description: string | null;
  durationSeconds: number | null;
  thumbnailRef: string | null;
}
export type MediaResource =
  | { kind: 'file'; root: string; relativePath: string }
  | { kind: 'upstream'; path: string };
export interface MediaProvider {
  readonly sourceType: SourceType;
  metadata(sourceId: string): Promise<MediaMetadata>;
  available(sourceId: string): Promise<boolean>;
  playback(sourceId: string): Promise<MediaResource>;
  thumbnail(sourceId: string): Promise<MediaResource | null>;
}
