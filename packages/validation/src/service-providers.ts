import { z } from "zod";

export const createServiceProviderSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20).optional(),
  address: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional(),
  /** Link to a garage that's on Le Garage (from GET /service-providers/directory). */
  garageOrganizationId: z.string().uuid().optional(),
});
export type CreateServiceProviderInput = z.infer<typeof createServiceProviderSchema>;

export const updateServiceProviderSchema = createServiceProviderSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateServiceProviderInput = z.infer<typeof updateServiceProviderSchema>;
