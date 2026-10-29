import { z } from "zod";

/** Suspending a tenant is a support/compliance action — always say why (docs/ADMIN.md). */
export const suspendOrganizationSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type SuspendOrganizationInput = z.infer<typeof suspendOrganizationSchema>;

export const adminUpdateStaffSchema = z.object({
  active: z.boolean(),
  reason: z.string().trim().min(5).max(500),
});
export type AdminUpdateStaffInput = z.infer<typeof adminUpdateStaffSchema>;
