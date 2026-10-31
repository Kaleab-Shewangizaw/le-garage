import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { FleetSummary, SpendReport } from "@/lib/api-types";

export function useFleetSummary(enabled = true) {
  return useQuery({
    queryKey: ["reports", "fleet-summary"],
    queryFn: () => api.get<FleetSummary>("/reports/fleet-summary"),
    refetchInterval: 60_000,
    enabled,
  });
}

/** `to` is exclusive (ReportsService). */
export function useSpendReport(from: string, to: string) {
  return useQuery({
    queryKey: ["reports", "spend", from, to],
    queryFn: () => api.get<SpendReport>("/reports/spend", { from, to }),
    enabled: !!from && !!to,
  });
}
