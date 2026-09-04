import { z } from "zod";
import { createCustomerSchema } from "./customers";
import { createVehicleSchema } from "./vehicles";

/**
 * Intake is deliberately "find or create" in one call for both customer and
 * vehicle, matching the fast intake flow in docs/UX.md:
 * plate -> customer -> vehicle -> mileage -> complaint -> photos -> done.
 */
export const createJobSchema = z.object({
  customerId: z.string().uuid().optional(),
  newCustomer: createCustomerSchema.optional(),
  vehicleId: z.string().uuid().optional(),
  newVehicle: createVehicleSchema.optional(),
  complaint: z.string().min(1).max(2000),
  mileageAtIntake: z.number().int().min(0).optional(),
}).refine((d) => !!d.customerId !== !!d.newCustomer, {
  message: "Provide exactly one of customerId or newCustomer",
  path: ["customerId"],
}).refine((d) => !!d.vehicleId !== !!d.newVehicle, {
  message: "Provide exactly one of vehicleId or newVehicle",
  path: ["vehicleId"],
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobStatusSchema = z.object({
  toStatus: z.enum([
    "INTAKE",
    "DIAGNOSING",
    "WAITING_APPROVAL",
    "APPROVED",
    "WAITING_PARTS",
    "IN_PROGRESS",
    "QUALITY_CHECK",
    "READY",
    "COLLECTED",
    "ON_HOLD",
    "CANCELLED",
    "CLOSED",
  ]),
  note: z.string().max(1000).optional(),
});
export type UpdateJobStatusInput = z.infer<typeof updateJobStatusSchema>;

export const assignTechnicianSchema = z.object({
  staffMemberId: z.string().uuid(),
});
export type AssignTechnicianInput = z.infer<typeof assignTechnicianSchema>;
