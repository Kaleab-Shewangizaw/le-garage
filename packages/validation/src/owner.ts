import { z } from "zod";

export const ownerRegisterSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
});
export type OwnerRegisterInput = z.infer<typeof ownerRegisterSchema>;

export const confirmCustomerLinkSchema = z.object({
  customerId: z.string().uuid(),
});
export type ConfirmCustomerLinkInput = z.infer<typeof confirmCustomerLinkSchema>;

/**
 * The owner is always deciding as themselves, in-app — unlike the
 * staff-facing createApprovalSchema, there's no `method` to pick (it's
 * always IN_APP) and no note requirement (docs/OWNER-APP.md §"Approval
 * flow").
 */
export const ownerEstimateDecisionSchema = z.object({
  itemDecisions: z
    .array(
      z.object({
        estimateItemId: z.string().uuid(),
        decision: z.enum(["APPROVED", "REJECTED"]),
      }),
    )
    .min(1),
  note: z.string().max(1000).optional(),
});
export type OwnerEstimateDecisionInput = z.infer<typeof ownerEstimateDecisionSchema>;
