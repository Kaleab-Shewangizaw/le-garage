import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OwnerJob } from "@/lib/api-types";

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ["jobs", id],
    queryFn: () => api.get<OwnerJob>(`/owner/jobs/${id}`),
    enabled: !!id,
  });
}

interface DecideInput {
  estimateId: string;
  itemDecisions: { estimateItemId: string; decision: "APPROVED" | "REJECTED" }[];
  note?: string;
}

/**
 * Never optimistic (brief §23 — "never pretend an action succeeded if the
 * server hasn't confirmed it"): the estimate/job views only reflect the
 * new decision once this mutation resolves and the query is refetched.
 */
export function useDecideEstimate(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ estimateId, itemDecisions, note }: DecideInput) =>
      api.post(`/owner/estimates/${estimateId}/decide`, { itemDecisions, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}
