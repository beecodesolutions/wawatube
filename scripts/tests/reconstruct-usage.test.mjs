import assert from 'node:assert/strict';
import test from 'node:test';
import { reconstructUsage } from '../reconstruct-usage.mjs';
const start = Date.parse('2026-10-02T21:00:00Z');
const line = (id, offset) =>
  JSON.stringify({
    time: start + offset,
    req: { method: 'POST', url: `/api/kids/media/${id}/telemetry` },
  });
const log = [
  line('aaa', 0),
  line('aaa', 10000),
  line('bbb', 11000),
  line('bbb', 31000),
  line('aaa', 86400000),
].join('\n');
test('reconstruction preserves totals, order, repeat views and stable session IDs', () => {
  const days = [
    { day: '2026-10-02', views: 2, seconds: 31 },
    { day: '2026-10-03', views: 1, seconds: 5 },
  ];
  const sessions = reconstructUsage(log, days, start);
  assert.equal(sessions.length, 2);
  assert.deepEqual(
    sessions[0].views.map((view) => view.watchedSeconds),
    [10, 21],
  );
  assert.equal(sessions[1].views[0].watchedSeconds, 5);
  assert.notEqual(sessions[0].views[0].id, sessions[1].views[0].id);
  assert.deepEqual(reconstructUsage(log, days, start), sessions);
  assert.throws(
    () => reconstructUsage(log, [{ ...days[0], views: 3 }, days[1]], start),
    /count mismatch/,
  );
});
