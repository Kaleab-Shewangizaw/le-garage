import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().min(3, "Email or phone is required"), // email or phone
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const registerOrganizationSchema = z.object({
  /** GARAGE (default, the original product) or FLEET — a company maintaining its own vehicles (docs/FLEET.md). */
  kind: z.enum(["GARAGE", "FLEET"]).default("GARAGE"),
  organizationName: z.string().min(2).max(120),
  /** Required for garages; a fleet's workspace is simply named after the organization. */
  garageName: z.string().min(2).max(120).optional(),
  garagePhone: z.string().min(6).max(20).optional(),
  garageAddress: z.string().max(240).optional(),
  ownerFullName: z.string().min(2).max(120),
  ownerEmail: z.string().email().optional(),
  ownerPhone: z.string().min(6).max(20).optional(),
  password: z.string().min(8).max(128),
}).refine((data) => data.ownerEmail || data.ownerPhone, {
  message: "Either ownerEmail or ownerPhone is required",
  path: ["ownerEmail"],
}).refine((data) => data.kind === "FLEET" || !!data.garageName, {
  message: "Garage name is required",
  path: ["garageName"],
});
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;
