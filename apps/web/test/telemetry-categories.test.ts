import assert from 'node:assert/strict';
import test from 'node:test';
import { categorySegments } from '../src/features/parent/telemetry-categories.ts';

test('merges category videos and orders each day largest first', () => {
  const assignments = {
    a: { id: 'nature', name: 'Nature', color: '#123456' },
    b: { id: 'music', name: 'Music', color: '#654321' },
    c: { id: 'nature', name: 'Nature', color: '#123456' },
  };
  const videos = [
    { mediaId: 'a', title: 'A', seconds: 120, views: 1 },
    { mediaId: 'b', title: 'B', seconds: 180, views: 1 },
    { mediaId: 'c', title: 'C', seconds: 120, views: 1 },
    { mediaId: 'missing', title: 'Missing', seconds: 60, views: 1 },
  ];
  assert.deepEqual(
    categorySegments(videos, assignments).map(({ id, minutes }) => ({
      id,
      minutes,
    })),
    [
      { id: 'nature', minutes: 4 },
      { id: 'music', minutes: 3 },
      { id: 'uncategorized', minutes: 1 },
    ],
  );
  assert.equal(
    categorySegments(
      [{ ...videos[1], seconds: 600 }, videos[0]],
      assignments,
    )[0].id,
    'music',
  );
  assert.deepEqual(categorySegments([], assignments), []);
});
