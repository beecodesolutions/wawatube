import type { TelemetryReport } from '@wawatube/shared';

export type VideoCategory = {
  id: string;
  name: string;
  icon?: string;
  color: string | null;
};

export function categorySegments(
  videos: NonNullable<TelemetryReport['daily'][number]['videos']>,
  assignments: Record<string, VideoCategory>,
) {
  const grouped = new Map<string, VideoCategory & { minutes: number }>();
  for (const video of videos) {
    const category = assignments[video.mediaId] ?? {
      id: 'uncategorized',
      name: '',
      color: null,
    };
    const segment = grouped.get(category.id) ?? { ...category, minutes: 0 };
    segment.minutes += video.seconds / 60;
    grouped.set(category.id, segment);
  }
  return [...grouped.values()].sort(
    (a, b) => b.minutes - a.minutes || a.id.localeCompare(b.id),
  );
}

export function sessionCategories(
  videos: TelemetryReport['sessions'][number]['videos'],
  assignments: Record<string, VideoCategory>,
) {
  const grouped = new Map<string, VideoCategory & { count: number }>();
  for (const video of videos) {
    const category = assignments[video.mediaId] ?? {
      id: 'uncategorized',
      name: '',
      color: null,
    };
    const segment = grouped.get(category.id) ?? { ...category, count: 0 };
    segment.count++;
    grouped.set(category.id, segment);
  }
  return [...grouped.values()].sort(
    (a, b) => b.count - a.count || a.id.localeCompare(b.id),
  );
}
