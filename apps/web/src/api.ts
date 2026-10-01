import type {
  AdminMedia,
  Category,
  CategoryInput,
  ChildMedia,
  ImportConfirmation,
  ImportJob,
  LibraryResponse,
  LocalCandidate,
  MediaUpdate,
} from '@wawatube/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }

  get unauthorized(): boolean {
    return this.code.toUpperCase() === 'UNAUTHORIZED';
  }
}

const authEvents = new EventTarget();

export function subscribeUnauthorized(listener: () => void): () => void {
  const handler = () => listener();
  authEvents.addEventListener('unauthorized', handler);
  return () => authEvents.removeEventListener('unauthorized', handler);
}

function isErrorPayload(value: unknown): value is { code?: unknown } {
  return typeof value === 'object' && value !== null && 'code' in value;
}

async function readCode(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isErrorPayload(payload) && typeof payload.code === 'string')
      return payload.code;
  } catch {
    // Some errors intentionally have no JSON body.
  }
  return response.status === 401 ? 'unauthorized' : 'generic';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const code = await readCode(response);
    if (response.status === 401)
      authEvents.dispatchEvent(new Event('unauthorized'));
    throw new ApiRequestError(response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (value: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(value),
});

export const api = {
  childCategories: () => request<Category[]>('/api/kids/categories'),
  childCategoryMedia: (id: string) =>
    request<{ category: Category; media: ChildMedia[] }>(
      `/api/kids/categories/${encodeURIComponent(id)}/media`,
    ),
  childMedia: (id: string) =>
    request<ChildMedia>(`/api/kids/media/${encodeURIComponent(id)}`),
  session: () => request<{ authenticated: boolean }>('/api/admin/auth/session'),
  login: (pin: string) => request<void>('/api/admin/auth/login', json({ pin })),
  logout: () => request<void>('/api/admin/auth/logout', { method: 'POST' }),
  adminMedia: () => request<LibraryResponse>('/api/admin/media'),
  updateMedia: (id: string, update: MediaUpdate) =>
    request<AdminMedia>(`/api/admin/media/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),
  deleteMedia: (id: string) =>
    request<void>(`/api/admin/media/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  categories: () => request<Category[]>('/api/admin/categories'),
  createCategory: (input: CategoryInput) =>
    request<Category>('/api/admin/categories', json(input)),
  updateCategory: (id: string, input: CategoryInput) =>
    request<Category>(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteCategory: (id: string) =>
    request<void>(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  importYoutube: (url: string) =>
    request<ImportJob>('/api/admin/import/youtube', json({ url })),
  importJob: (id: string) =>
    request<ImportJob>(`/api/admin/import/${encodeURIComponent(id)}`),
  confirmImport: (id: string, input: ImportConfirmation) =>
    request<ImportJob>(
      `/api/admin/import/${encodeURIComponent(id)}/confirm`,
      json(input),
    ),
  retryImport: (id: string) =>
    request<ImportJob>(
      `/api/admin/import/${encodeURIComponent(id)}/retry`,
      json({}),
    ),
  importThumbnail: (id: string) =>
    `/api/admin/import/${encodeURIComponent(id)}/thumbnail`,
  localCandidates: () =>
    request<LocalCandidate[]>('/api/admin/local/candidates'),
  registerLocal: (sourceId: string, categoryIds: string[], visible: boolean) =>
    request<AdminMedia>(
      '/api/admin/import/local',
      json({ sourceId, categoryIds, visible }),
    ),
};

export function errorText(
  error: unknown,
  translate: (key: string) => string,
): string {
  if (error instanceof ApiRequestError) {
    const code = error.code.toUpperCase();
    if (code === 'UNAUTHORIZED') return translate('errors.UNAUTHORIZED');
    const key = `errors.${code}`;
    const translated = translate(key);
    return translated === key ? translate('errors.generic') : translated;
  }
  return translate('errors.generic');
}
