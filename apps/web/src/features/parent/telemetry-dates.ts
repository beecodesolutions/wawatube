import type { TelemetryReport } from '@wawatube/shared';

export const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function lastSevenDays(
  daily: TelemetryReport['daily'],
  now = new Date(),
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const byDate = new Map(daily.map((day) => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 6 + index);
    const key = localDayKey(date);
    return byDate.get(key) ?? { date: key, seconds: 0, views: 0 };
  });
}

export function sessionWeek(
  sessions: TelemetryReport['sessions'],
  weekOffset: number,
  now = new Date(),
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - weekOffset * 7 - index);
    const key = localDayKey(date);
    const daySessions = sessions
      .filter((session) => localDayKey(new Date(session.startedAt)) === key)
      .sort(
        (a, b) =>
          a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
      );
    return {
      date,
      key,
      sessions: daySessions,
      videos: daySessions.flatMap((session) => session.videos),
      seconds: daySessions.reduce((sum, session) => sum + session.seconds, 0),
    };
  });
}

export function usageDayLabel(
  date: Date,
  weekOffset: number,
  now = new Date(),
  locale = 'es',
) {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long' };
  if (weekOffset > 0) {
    options.day = 'numeric';
    if (
      date.getMonth() !== now.getMonth() ||
      date.getFullYear() !== now.getFullYear()
    )
      options.month = 'long';
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  }
  const label = new Intl.DateTimeFormat(locale, options)
    .formatToParts(date)
    .map((part) =>
      part.type === 'month'
        ? part.value.charAt(0).toLocaleUpperCase(locale) + part.value.slice(1)
        : part.value,
    )
    .join('')
    .replace(',', '');
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}
