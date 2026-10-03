const SESSION_STORAGE_KEY = 'wawatube.telemetry.session';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredSession {
  id: string;
  lastActivityAt: number;
}

let volatileSession: StoredSession | null = null;

export function createTelemetryId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return volatileSession;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('id' in value) ||
      !('lastActivityAt' in value) ||
      typeof value.id !== 'string' ||
      !UUID_PATTERN.test(value.id) ||
      typeof value.lastActivityAt !== 'number' ||
      !Number.isFinite(value.lastActivityAt)
    )
      return null;
    return { id: value.id, lastActivityAt: value.lastActivityAt };
  } catch {
    return volatileSession;
  }
}

function writeStoredSession(session: StoredSession): void {
  volatileSession = session;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in private browsing or restricted frames.
  }
}

export function getTelemetrySessionId(now = Date.now()): string {
  const stored = readStoredSession();
  if (stored && now - stored.lastActivityAt <= SESSION_IDLE_MS)
    return stored.id;

  const id = createTelemetryId();
  writeStoredSession({ id, lastActivityAt: now });
  return id;
}

export function touchTelemetrySession(id: string, now = Date.now()): void {
  writeStoredSession({ id, lastActivityAt: now });
}

export function clearTelemetrySession(): void {
  volatileSession = null;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing or restricted frames.
  }
}
