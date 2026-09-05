import { z } from "zod";

/**
 * Allow-listed MIME types (docs/SECURITY.md §7): images, one short-video
 * format, and PDFs for documents. Enforced both here (fast client
 * feedback) and again server-side against the actual presigned policy —
 * never trust the client's claimed type alone.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/pdf",
] as const;

// Exported (not just used internally) so the API can re-check the *actual*
// uploaded size at registration time — a presigned PUT URL constrains
// content-type but not byte count, so the declared sizeBytes at presign
// time is only ever a client's claim, never enforced against reality
// until now (docs/SECURITY.md §7).
export const MAX_IMAGE_OR_DOC_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_VIDEO_BYTES = 75 * 1024 * 1024; // 75MB

export function maxBytesFor(mimeType: string): number {
  return mimeType === "video/mp4" ? MAX_VIDEO_BYTES : MAX_IMAGE_OR_DOC_BYTES;
}

export const attachmentEntityTypeSchema = z.enum(["JOB", "DIAGNOSIS", "ESTIMATE", "VEHICLE"]);

export const presignUploadSchema = z
  .object({
    entityType: attachmentEntityTypeSchema,
    entityId: z.string().uuid(),
    fileName: z.string().min(1).max(200),
    mimeType: z.enum(ALLOWED_ATTACHMENT_MIME_TYPES),
    sizeBytes: z.number().int().min(1),
  })
  .refine((d) => d.sizeBytes <= (d.mimeType === "video/mp4" ? MAX_VIDEO_BYTES : MAX_IMAGE_OR_DOC_BYTES), {
    message: "File is too large",
    path: ["sizeBytes"],
  });
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const registerAttachmentSchema = z.object({
  objectKey: z.string().min(1).max(500),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().uuid(),
  mimeType: z.enum(ALLOWED_ATTACHMENT_MIME_TYPES),
  sizeBytes: z.number().int().min(1),
});
export type RegisterAttachmentInput = z.infer<typeof registerAttachmentSchema>;
