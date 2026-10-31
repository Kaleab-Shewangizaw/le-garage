import { z } from "zod";
import { createCustomerSchema } from "./customers";
import { createVehicleSchema } from "./vehicles";

/**
 * Intake is deliberately "find or create" in one call for both customer and
 * vehicle, matching the fast intake flow in docs/UX.md:
 * plate -> customer -> vehicle -> mileage -> complaint -> photos -> done.
 */
/**
 * Garage orgs must identify a customer (exactly one of customerId /
 * newCustomer); fleet orgs must not — the organization owns the vehicle.
 * That org-kind rule is enforced in JobsService, since the schema can't
 * know the caller's organization; here we only reject sending both.
 */
export const createJobSchema = z.object({
  customerId: z.string().uuid().optional(),
  newCustomer: createCustomerSchema.optional(),
  vehicleId: z.string().uuid().optional(),
  newVehicle: createVehicleSchema.optional(),
  complaint: z.string().min(1).max(2000),
  mileageAtIntake: z.number().int().min(0).optional(),
  /** Fleet orgs only — which external provider will do the work, if already known. */
  serviceProviderId: z.string().uuid().optional(),
}).refine((d) => !(d.customerId && d.newCustomer), {
  message: "Provide only one of customerId or newCustomer",
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

/** `null` unassigns the provider. */
export const assignServiceProviderSchema = z.object({
  serviceProviderId: z.string().uuid().nullable(),
});
export type AssignServiceProviderInput = z.infer<typeof assignServiceProviderSchema>;
