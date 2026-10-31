import { averageHours, HOUR_MS, overlapMs, repairDowntimeMs } from "./report-math";

const d = (iso: string) => new Date(iso);

describe("overlapMs", () => {
  const from = d("2026-10-01T00:00:00Z");
  const to = d("2026-11-01T00:00:00Z");

  it("counts an interval fully inside the range", () => {
    expect(overlapMs(d("2026-10-05T00:00:00Z"), d("2026-10-06T00:00:00Z"), from, to)).toBe(24 * HOUR_MS);
  });

  it("clips an interval that started before the range", () => {
    expect(overlapMs(d("2026-09-30T00:00:00Z"), d("2026-10-02T00:00:00Z"), from, to)).toBe(24 * HOUR_MS);
  });

  it("clips an interval that ends after the range", () => {
    expect(overlapMs(d("2026-10-31T12:00:00Z"), d("2026-11-03T00:00:00Z"), from, to)).toBe(12 * HOUR_MS);
  });

  it("is zero for an interval entirely outside the range", () => {
    expect(overlapMs(d("2026-08-01T00:00:00Z"), d("2026-08-02T00:00:00Z"), from, to)).toBe(0);
  });
});

describe("repairDowntimeMs", () => {
  const from = d("2026-10-01T00:00:00Z");
  const to = d("2026-11-01T00:00:00Z");
  const now = d("2026-10-10T00:00:00Z");

  it("runs an open repair up to now", () => {
    const job = { intakeAt: d("2026-10-08T00:00:00Z"), collectedAt: null, cancelledAt: null };
    expect(repairDowntimeMs(job, from, to, now)).toBe(48 * HOUR_MS);
  });

  it("ends a returned repair at collectedAt", () => {
    const job = { intakeAt: d("2026-10-02T00:00:00Z"), collectedAt: d("2026-10-02T06:00:00Z"), cancelledAt: null };
    expect(repairDowntimeMs(job, from, to, now)).toBe(6 * HOUR_MS);
  });

  it("ends a cancelled repair at cancelledAt", () => {
    const job = { intakeAt: d("2026-10-03T00:00:00Z"), collectedAt: null, cancelledAt: d("2026-10-03T01:00:00Z") };
    expect(repairDowntimeMs(job, from, to, now)).toBe(HOUR_MS);
  });
});

describe("averageHours", () => {
  it("is null with no data rather than a fabricated zero", () => {
    expect(averageHours([])).toBeNull();
  });

  it("averages and rounds to one decimal", () => {
    expect(averageHours([HOUR_MS, 2 * HOUR_MS])).toBe(1.5);
  });
});
