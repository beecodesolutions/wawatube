import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from '../src/api.ts';

test('parent reload checks the existing session; return from child waits for logout', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let authenticated = true;
  let finishLogout: () => void = () => {};
  globalThis.fetch = async (input) => {
    const path = String(input);
    calls.push(path);
    if (path.endsWith('/logout')) {
      await new Promise<void>((resolve) => {
        finishLogout = resolve;
      });
      authenticated = false;
      return new Response(null, { status: 204 });
    }
    return Response.json({ authenticated, pinRequired: true });
  };
  try {
    assert.equal((await api.session()).authenticated, true);
    assert.deepEqual(calls, ['/api/admin/auth/session']);
    const logout = api.logout();
    const session = api.session();
    await Promise.resolve();
    assert.equal(calls.length, 2, 'session must wait for pending logout');
    finishLogout();
    await logout;
    assert.equal((await session).authenticated, false);
    assert.deepEqual(calls, [
      '/api/admin/auth/session',
      '/api/admin/auth/logout',
      '/api/admin/auth/session',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
