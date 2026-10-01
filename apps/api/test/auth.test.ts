import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin } from '../src/auth/service.js';

test('PIN hashes verify without storing the clear text', async () => {
  const encoded = await hashPin('1234');
  assert.notEqual(encoded, '1234');
  assert.equal(await verifyPin('1234', encoded), true);
  assert.equal(await verifyPin('9999', encoded), false);
});
