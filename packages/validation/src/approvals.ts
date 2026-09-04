import { z } from "zod";

export const createApprovalSchema = z.object({
  method: z.enum(["IN_APP", "VERBAL_LOGGED_BY_STAFF", "PHONE"]),
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
  (d) => d.method === "IN_APP" || (d.note && d.note.trim().length > 0),
  {
    message: "A note is required when logging a verbal or phone approval",
    path: ["note"],
  },
);
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;
