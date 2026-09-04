import { z } from "zod";

export const updateGarageSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(6).max(20).optional(),
  address: z.string().max(240).optional(),
  city: z.string().max(80).optional(),
});
export type UpdateGarageInput = z.infer<typeof updateGarageSchema>;
