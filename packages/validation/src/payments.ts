import { z } from "zod";

export const recordPaymentSchema = z.object({
  amount: z.number().int().min(1), // minor units
  method: z.enum(["CASH", "TELEBIRR", "BANK_TRANSFER", "OTHER"]),
  reference: z.string().max(200).optional(),
  paidAt: z.string().datetime().optional(), // defaults to now on the server
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const voidPaymentSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
