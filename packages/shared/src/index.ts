export type SourceType = 'YOUTUBE' | 'LOCAL';
export type ImportState =
  'EXTRACTING' | 'PREVIEW' | 'QUEUED' | 'READY' | 'FAILED';
export type Availability = 'AVAILABLE' | 'MISSING' | 'UNAVAILABLE';
export interface Category {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  thumbnailMediaId: string | null;
  thumbnailUrl: string | null;
}
export interface ChildMedia {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  playbackUrl: string;
}
export interface AdminMedia extends ChildMedia {
  sourceType: SourceType;
  visible: boolean;
  sortOrder: number;
  categoryIds: string[];
  availability: Availability;
}
export interface ImportJob {
  id: string;
  sourceType: SourceType;
  state: ImportState;
  title: string | null;
  description: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  mediaItemId: string | null;
  errorCode: string | null;
}
export interface LocalCandidate {
  sourceId: string;
  title: string;
}
export interface PlaylistImportRequest {
  url: string;
  categoryId?: string;
  visible: boolean;
}
export interface PlaylistImportJob {
  id: string;
  playlistId: string;
  state: 'EXTRACTING' | 'READY' | 'FAILED';
  title: string | null;
  videoCount: number;
  downloadedCount: number;
  failedCount: number;
  pendingCount: number;
  errorCode: string | null;
}
export interface LibraryResponse {
  media: AdminMedia[];
  imports: ImportJob[];
  playlistImports: PlaylistImportJob[];
  counts: {
    total: number;
    available: number;
    downloading: number;
    failed: number;
  };
}
export interface MediaUpdate {
  title?: string;
  visible?: boolean;
  sortOrder?: number;
  categoryIds?: string[];
}
export interface CategoryInput {
  name: string;
  icon: string;
  sortOrder?: number;
  thumbnailMediaId?: string | null;
}
export interface ImportConfirmation {
  categoryIds: string[];
  visible: boolean;
}
export interface ApiError {
  code: string;
}
