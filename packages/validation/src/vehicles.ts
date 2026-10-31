import { z } from "zod";

export const vehicleTypeSchema = z.enum(["CAR", "PICKUP", "VAN", "TRUCK", "MINIBUS", "BUS", "MOTORCYCLE", "OTHER"]);
export const vehicleStatusSchema = z.enum(["ACTIVE", "IN_MAINTENANCE", "UNAVAILABLE", "RETIRED"]);
/** Checked per request (a refine, not a fixed max date) so "the future" doesn't freeze at server start. */
const acquiredAtSchema = z.coerce.date().refine((d) => d.getTime() <= Date.now() + 24 * 3600_000, "Can't be in the future");

export const fuelTypeSchema = z.enum(["DIESEL", "PETROL", "HYBRID", "ELECTRIC", "OTHER"]);

export const createVehicleSchema = z.object({
  licensePlate: z.string().min(2).max(20),
  vin: z.string().min(5).max(32).optional(),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1950).max(2100).optional(),
  color: z.string().max(40).optional(),
  lastKnownMileage: z.number().int().min(0).optional(),
  vehicleType: vehicleTypeSchema.optional(),
  // Vehicle profile (fleet orgs).
  fuelType: fuelTypeSchema.optional(),
  acquiredAt: acquiredAtSchema.optional(),
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
  ownerCustomerId: z.string().uuid().optional(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema
  .partial()
  .omit({ ownerCustomerId: true })
  .extend({
    /** Manual availability override (fleet orgs). IN_MAINTENANCE is also set/cleared automatically by repairs. */
    status: vehicleStatusSchema.optional(),
    // Profile fields can be cleared, so `null` means "remove", undefined "unchanged".
    color: z.string().max(40).nullable().optional(),
    vin: z.string().min(5).max(32).nullable().optional(),
    acquiredAt: acquiredAtSchema.nullable().optional(),
    driverName: z.string().trim().max(120).nullable().optional(),
    driverPhone: z.string().trim().max(20).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  });
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
