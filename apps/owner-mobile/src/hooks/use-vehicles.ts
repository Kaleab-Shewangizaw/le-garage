import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OwnerVehicleDetail, OwnerVehicleListItem } from "@/lib/api-types";

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api.get<OwnerVehicleListItem[]>("/owner/vehicles"),
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicles", id],
    queryFn: () => api.get<OwnerVehicleDetail>(`/owner/vehicles/${id}`),
    enabled: !!id,
  });
}
