import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttachmentEntityType, AttachmentTag } from "@le-garage/types";
import type { UpdateAttachmentInput } from "@le-garage/validation";
import { api } from "@/lib/api-client";
import type { Attachment } from "@/lib/api-types";

export function useAttachments(entityType: AttachmentEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ["attachments", entityType, entityId],
    queryFn: () => api.get<Attachment[]>("/files", { entityType, entityId }),
    enabled: !!entityId,
  });
}

export function useAttachmentUrl(attachmentId: string | undefined) {
  return useQuery({
    queryKey: ["attachments", "url", attachmentId],
    queryFn: () => api.get<{ url: string; mimeType: string }>(`/files/${attachmentId}/url`),
    enabled: !!attachmentId,
    staleTime: 5 * 60_000, // signed URLs are valid for 10 minutes server-side
  });
}

interface UploadInput {
  entityType: AttachmentEntityType;
  entityId: string;
  file: File;
}

/**
 * Presign -> PUT directly to object storage -> register (docs/SECURITY.md
 * §7). The file bytes never pass through our API — only the presigned URL
 * and the resulting metadata do.
 */
export function useUploadAttachment(entityType: AttachmentEntityType, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, tag, caption }: Pick<UploadInput, "file"> & { tag?: AttachmentTag; caption?: string }) => {
      const presign = await api.post<{ uploadUrl: string; objectKey: string }>("/files/presign", {
        entityType,
        entityId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      const putRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error("Upload to storage failed");
      }

      return api.post<Attachment>("/files", {
        objectKey: presign.objectKey,
        entityType,
        entityId,
        mimeType: file.type,
        sizeBytes: file.size,
        tag,
        caption,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
      // Vehicle profiles show every repair's photos too.
      queryClient.invalidateQueries({ queryKey: ["vehicles"], exact: false });
    },
  });
}

export function useDeleteAttachment(entityType: AttachmentEntityType, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => api.delete(`/files/${attachmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
    },
  });
}

export function useUpdateAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAttachmentInput }) => api.patch<Attachment>(`/files/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["vehicles"], exact: false });
    },
  });
}
