import assert from 'node:assert/strict';
import test from 'node:test';
import { childMedia } from '../src/media-gateway.js';

const row = {
  id: 'local-video',
  title: 'Local video',
  description: null,
  durationSeconds: 1,
};

test('exposes the local thumbnail endpoint when the stored thumbnail is missing', () => {
  assert.equal(
    childMedia({ ...row, sourceType: 'LOCAL' }).thumbnailUrl,
    '/api/kids/media/local-video/thumbnail',
  );
  assert.equal(
    childMedia({ ...row, sourceType: 'YOUTUBE' }).thumbnailUrl,
    null,
  );
});
