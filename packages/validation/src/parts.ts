import { z } from "zod";

export const createJobPartSchema = z.object({
  name: z.string().min(1).max(200),
  partNumber: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  condition: z.enum(["NEW", "USED", "REFURBISHED"]).default("NEW"),
  source: z.enum(["GARAGE_SUPPLIED", "CUSTOMER_SUPPLIED"]).default("GARAGE_SUPPLIED"),
  supplier: z.string().max(200).optional(),
  quantity: z.number().int().min(1).default(1),
  unitCost: z.number().int().min(0).optional(), // minor units, internal — not shown to customer
  unitPrice: z.number().int().min(0), // minor units, what the customer is charged
  warrantyMonths: z.number().int().min(0).optional(),
});
// z.input (not z.infer/z.output): callers may omit fields that have a
// server-side default (condition, source, quantity) — the API fills them
// in during validation. Using the output type here would wrongly force
// every caller (including garage-web's forms) to pass them explicitly.
export type CreateJobPartInput = z.input<typeof createJobPartSchema>;

export const updateJobPartSchema = createJobPartSchema.partial();
export type UpdateJobPartInput = z.input<typeof updateJobPartSchema>;
