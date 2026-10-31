import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeclineWorkOrderInput, SendWorkOrderInput } from "@le-garage/validation";
import { api } from "@/lib/api-client";
import type { WorkOrderRow, WorkOrderStatus } from "@/lib/api-types";

export function useWorkOrders(status?: WorkOrderStatus, enabled = true) {
  return useQuery({
    queryKey: ["work-orders", status],
    queryFn: () => api.get<WorkOrderRow[]>("/work-orders", { status }),
    refetchInterval: 30_000,
    enabled,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["work-orders", "jobs", "dashboard", "reports", "notifications"]) {
      queryClient.invalidateQueries({ queryKey: [key], exact: false });
    }
  };
}

export function useSendWorkOrder(jobId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SendWorkOrderInput) => api.post(`/jobs/${jobId}/work-order`, input),
    onSuccess: invalidate,
  });
}

export function useAcceptWorkOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<{ workOrderId: string; jobId: string }>(`/work-orders/${id}/accept`),
    onSuccess: invalidate,
  });
}

export function useDeclineWorkOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeclineWorkOrderInput }) => api.post(`/work-orders/${id}/decline`, input),
    onSuccess: invalidate,
  });
}

export function useCancelWorkOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/work-orders/${id}/cancel`),
    onSuccess: invalidate,
  });
}
