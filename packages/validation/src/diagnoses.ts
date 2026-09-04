import { z } from "zod";

export const createDiagnosisSchema = z.object({
  observedProblem: z.string().min(1).max(2000),
  suspectedCause: z.string().max(2000).optional(),
  confirmedCause: z.string().max(2000).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  recommendedRepair: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
export type CreateDiagnosisInput = z.infer<typeof createDiagnosisSchema>;
