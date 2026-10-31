import { z } from "zod";

export const createApprovalSchema = z.object({
  /** STAFF_DECISION is a fleet manager deciding on their own company's spend; only valid for FLEET orgs (ApprovalsService). */
  method: z.enum(["IN_APP", "VERBAL_LOGGED_BY_STAFF", "PHONE", "STAFF_DECISION"]),
  note: z.string().max(1000).optional(),
  itemDecisions: z
    .array(
      z.object({
        estimateItemId: z.string().uuid(),
        decision: z.enum(["APPROVED", "REJECTED"]),
      }),
    )
    .min(1),
}).refine(
  (d) => (d.method !== "VERBAL_LOGGED_BY_STAFF" && d.method !== "PHONE") || (d.note && d.note.trim().length > 0),
  {
    message: "A note is required when logging a verbal or phone approval",
    path: ["note"],
  },
);
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;
