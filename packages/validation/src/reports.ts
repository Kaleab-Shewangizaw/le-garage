import { z } from "zod";

const MAX_RANGE_DAYS = 366;

/**
 * Date range for fleet reports. `to` is exclusive. Bounded so one request
 * can't ask the database to aggregate an unbounded history.
 */
export const reportRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((d) => d.to > d.from, { message: "`to` must be after `from`", path: ["to"] })
  .refine((d) => d.to.getTime() - d.from.getTime() <= MAX_RANGE_DAYS * 24 * 3600_000, {
    message: `Date range can be at most ${MAX_RANGE_DAYS} days`,
    path: ["to"],
  });
export type ReportRangeInput = z.infer<typeof reportRangeSchema>;
