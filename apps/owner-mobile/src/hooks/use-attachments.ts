import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useAttachmentUrl(attachmentId: string | undefined) {
  return useQuery({
    queryKey: ["attachments", "url", attachmentId],
    queryFn: () => api.get<{ url: string; mimeType: string }>(`/owner/attachments/${attachmentId}/url`),
    enabled: !!attachmentId,
    staleTime: 5 * 60_000,
  });
}
