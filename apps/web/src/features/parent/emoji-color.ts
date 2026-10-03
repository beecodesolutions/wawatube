// Sample rendered emoji, grouping similar shades instead of averaging all colors.
export function emojiColor(emoji: string): string | undefined {
  if (!emoji.trim()) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.font =
    '48px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, 32, 32);
  const pixels = context.getImageData(0, 0, 64, 64).data;
  const buckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    // Transparent edges and nearly black outlines should not dominate.
    if ((pixels[i + 3] ?? 0) < 128 || Math.max(r, g, b) < 40) continue;
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return undefined;
  return (
    '#' +
    [dominant.r, dominant.g, dominant.b]
      .map((value) =>
        Math.round(value / dominant.count)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
