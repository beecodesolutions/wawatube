import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
};
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: storage,
});
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
});

const {
  clearTelemetrySession,
  createTelemetryId,
  getTelemetrySessionId,
  touchTelemetrySession,
} = await import('../src/features/child/telemetry.ts');

const first = getTelemetrySessionId(1_000);
assert.match(first, uuid);
assert.equal(getTelemetrySessionId(1_000 + 29 * 60 * 1_000), first);
const afterIdle = getTelemetrySessionId(1_000 + 30 * 60 * 1_000 + 1);
assert.match(afterIdle, uuid);
assert.notEqual(afterIdle, first);
touchTelemetrySession(afterIdle, 2_000);
clearTelemetrySession();
assert.notEqual(getTelemetrySessionId(2_001), afterIdle);

const failingStorage = {
  getItem: () => null,
  setItem: () => {
    throw new Error('storage disabled');
  },
  removeItem: () => {
    throw new Error('storage disabled');
  },
};
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: failingStorage,
});
clearTelemetrySession();
const volatile = getTelemetrySessionId(3_000);
assert.equal(getTelemetrySessionId(3_001), volatile);

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
});
assert.match(createTelemetryId(), uuid);
