import { z } from "zod";

export const createJobNoteSchema = z.object({
  note: z.string().min(1).max(2000),
});
export type CreateJobNoteInput = z.infer<typeof createJobNoteSchema>;
