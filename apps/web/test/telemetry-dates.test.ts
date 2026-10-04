import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lastSevenDays,
  localDayKey,
} from '../src/features/parent/telemetry-dates.ts';

test('uses local calendar days across midnight and DST', () => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const beforeLocalMidnight = new Date('2026-03-08T04:30:00Z');
    const afterLocalMidnight = new Date('2026-03-08T05:30:00Z');
    const dayAfterDst = new Date('2026-03-09T04:30:00Z');

    assert.equal(localDayKey(beforeLocalMidnight), '2026-03-07');
    assert.equal(localDayKey(afterLocalMidnight), '2026-03-08');
    assert.equal(localDayKey(dayAfterDst), '2026-03-09');
    assert.deepEqual(
      lastSevenDays([], afterLocalMidnight).map((day) => day.date),
      [
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
      ],
    );
    assert.deepEqual(
      lastSevenDays([], dayAfterDst).map((day) => day.date),
      [
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
      ],
    );
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});
