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
