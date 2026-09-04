import { z } from "zod";

export const createCustomerSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
