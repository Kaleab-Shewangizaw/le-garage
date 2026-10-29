import { z } from "zod";

/** Fleet → garage (docs/WORK-ORDERS.md). */
export const sendWorkOrderSchema = z.object({
  message: z.string().trim().max(1000).optional(),
});
export type SendWorkOrderInput = z.infer<typeof sendWorkOrderSchema>;

export const declineWorkOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type DeclineWorkOrderInput = z.infer<typeof declineWorkOrderSchema>;
