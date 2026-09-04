import { z } from "zod";

export const createVehicleSchema = z.object({
  licensePlate: z.string().min(2).max(20),
  vin: z.string().min(5).max(32).optional(),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1950).max(2100).optional(),
  color: z.string().max(40).optional(),
  lastKnownMileage: z.number().int().min(0).optional(),
  ownerCustomerId: z.string().uuid().optional(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema.partial().omit({ ownerCustomerId: true });
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
