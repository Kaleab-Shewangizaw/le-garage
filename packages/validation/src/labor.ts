import { z } from "zod";

export const createJobLaborSchema = z.object({
  description: z.string().min(1).max(300),
  technicianStaffId: z.string().uuid().optional(),
  hours: z.number().min(0).optional(),
  rate: z.number().int().min(0).optional(), // minor units per hour, optional metadata
  amount: z.number().int().min(0), // minor units — the billable line total, always explicit (never derived silently from hours*rate)
});
export type CreateJobLaborInput = z.infer<typeof createJobLaborSchema>;

export const updateJobLaborSchema = createJobLaborSchema.partial();
export type UpdateJobLaborInput = z.infer<typeof updateJobLaborSchema>;
