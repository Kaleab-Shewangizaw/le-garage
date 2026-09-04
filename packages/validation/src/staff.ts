import { z } from "zod";

export const inviteStaffSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().optional(),
  phone: z.string().min(6).max(20).optional(),
  role: z.enum(["OWNER", "MANAGER", "FRONT_DESK", "TECHNICIAN"]),
  temporaryPassword: z.string().min(8).max(128),
}).refine((d) => d.email || d.phone, {
  message: "Either email or phone is required",
  path: ["email"],
});
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const updateStaffSchema = z.object({
  role: z.enum(["OWNER", "MANAGER", "FRONT_DESK", "TECHNICIAN"]).optional(),
  active: z.boolean().optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
