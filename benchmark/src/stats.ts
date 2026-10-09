/** Wilson score interval, 95%. Returns percentages rounded to 0.1. Used for every rate on the ARC leaderboard. */
export function wilson(successes: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  const r = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10;
  return { low: r(centre - half), high: r(centre + half) };
}

/** Minimum n before a row is ranked on the leaderboard. */
export const MIN_RANK_N = 10;
