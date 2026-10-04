import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lastSevenDays,
  localDayKey,
  sessionWeek,
  usageDayLabel,
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

test('session weeks use seven local calendar days, including empty days', () => {
  const now = new Date(2026, 9, 4, 12);
  const session = {
    id: 'a',
    startedAt: new Date(2026, 9, 3, 12).toISOString(),
    endedAt: new Date(2026, 9, 3, 13).toISOString(),
    active: false,
    seconds: 60,
    videos: [
      { id: 'view', mediaId: 'video', title: 'Video', thumbnailUrl: null },
    ],
  };
  const week = sessionWeek(
    [session, { ...session, id: 'b', seconds: 120 }],
    0,
    now,
  );
  assert.equal(week.length, 7);
  assert.equal(week[0].key, '2026-10-04');
  assert.equal(week[1].sessions.length, 2);
  assert.equal(week[1].seconds, 180);
  assert.equal(week[1].videos.length, 2);
  assert.equal(week[6].key, '2026-09-28');
  const previous = sessionWeek([session], 1, now);
  assert.equal(previous[0].key, '2026-09-27');
  assert.equal(previous[6].key, '2026-09-21');
  assert.equal(previous[0].sessions.length, 0);
  assert.equal(usageDayLabel(new Date(2026, 9, 2), 0, now), 'Viernes');
  assert.equal(usageDayLabel(new Date(2026, 9, 1), 1, now), 'Jueves 1');
  assert.equal(
    usageDayLabel(new Date(2026, 8, 29), 1, now),
    'Martes 29 de Septiembre',
  );
});
