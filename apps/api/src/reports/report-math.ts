/**
 * Pure time math for fleet reports (docs/FLEET.md). Kept free of Prisma so
 * the numbers a fleet supervisor sees are unit-testable on their own.
 */

export const HOUR_MS = 3600_000;

/** Milliseconds of [start, end) that fall inside [rangeFrom, rangeTo). */
export function overlapMs(start: Date, end: Date, rangeFrom: Date, rangeTo: Date): number {
  const from = Math.max(start.getTime(), rangeFrom.getTime());
  const to = Math.min(end.getTime(), rangeTo.getTime());
  return Math.max(0, to - from);
}

/**
 * When a repair stopped keeping its vehicle off the road: returned to
 * service (collectedAt) or cancelled. `null` means it's still open.
 */
export function repairEnd(job: { collectedAt: Date | null; cancelledAt: Date | null }): Date | null {
  return job.collectedAt ?? job.cancelledAt ?? null;
}

/** Downtime a single repair contributed within the range; open repairs count up to `now`. */
export function repairDowntimeMs(
  job: { intakeAt: Date; collectedAt: Date | null; cancelledAt: Date | null },
  rangeFrom: Date,
  rangeTo: Date,
  now: Date,
): number {
  const end = repairEnd(job) ?? now;
  return overlapMs(job.intakeAt, end, rangeFrom, rangeTo);
}

/** Mean of the given durations in hours, rounded to one decimal; null when there are none. */
export function averageHours(durationsMs: number[]): number | null {
  if (durationsMs.length === 0) return null;
  const mean = durationsMs.reduce((sum, d) => sum + d, 0) / durationsMs.length;
  return Math.round((mean / HOUR_MS) * 10) / 10;
}
