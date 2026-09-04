import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DashboardSummary } from "@/lib/api-types";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 60_000,
  });
}
