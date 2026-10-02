import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin } from '../src/auth/service.js';
import { loadConfig } from '../src/config.js';

test('PIN hashes verify without storing the clear text', async () => {
  const encoded = await hashPin('1234');
  assert.notEqual(encoded, '1234');
  assert.equal(await verifyPin('1234', encoded), true);
  assert.equal(await verifyPin('9999', encoded), false);
});

test('parent PIN bypass requires explicit development mode and flag', () => {
  const env = { DATABASE_URL: 'postgres://test', DEV_SKIP_PARENT_PIN: 'true' };
  assert.equal(
    loadConfig({ ...env, NODE_ENV: 'production' }).skipParentPin,
    false,
  );
  assert.equal(
    loadConfig({ ...env, NODE_ENV: 'development' }).skipParentPin,
    true,
  );
  assert.equal(
    loadConfig({
      ...env,
      NODE_ENV: 'development',
      DEV_SKIP_PARENT_PIN: 'false',
    }).skipParentPin,
    false,
  );
});
