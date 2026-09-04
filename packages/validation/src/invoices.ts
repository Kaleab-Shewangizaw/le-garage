import { z } from "zod";

export const generateInvoiceSchema = z.object({
  taxTotal: z.number().int().min(0).default(0),
  discountTotal: z.number().int().min(0).default(0),
});
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;
