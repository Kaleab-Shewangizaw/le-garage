import { z } from "zod";

export const estimateItemSchema = z.object({
  type: z.enum(["PART", "LABOR"]),
  description: z.string().min(1).max(300),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().int().min(0), // minor units (DATABASE.md §2)
  discount: z.number().int().min(0).default(0),
});
export type EstimateItemInput = z.infer<typeof estimateItemSchema>;

export const createEstimateSchema = z.object({
  items: z.array(estimateItemSchema).min(1),
  taxTotal: z.number().int().min(0).default(0),
});
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
