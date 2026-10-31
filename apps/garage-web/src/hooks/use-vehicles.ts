import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateVehicleInput, UpdateVehicleInput } from "@le-garage/validation";
import type { VehicleStatus } from "@le-garage/types";
import { api } from "@/lib/api-client";
import type { JobListItem, ServiceRecord, Vehicle, VehicleVisit } from "@/lib/api-types";

export function useVehicles(search?: string, options: { status?: VehicleStatus; limit?: number } = {}) {
  return useQuery({
    queryKey: ["vehicles", search, options],
    queryFn: () => api.get<Vehicle[]>("/vehicles", { search, status: options.status, limit: options.limit }),
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicles", id],
    queryFn: () => api.get<Vehicle>(`/vehicles/${id}`),
    enabled: !!id,
  });
}

export function useVehicleJobHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicles", id, "jobs"],
    queryFn: () => api.get<JobListItem[]>(`/vehicles/${id}/jobs`),
    enabled: !!id,
  });
}

export function useVehicleVisits(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicles", id, "visits"],
    queryFn: () => api.get<VehicleVisit[]>(`/vehicles/${id}/visits`),
    enabled: !!id,
  });
}

export function useVehicleServiceHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicles", id, "service-history"],
    queryFn: () => api.get<ServiceRecord[]>(`/vehicles/${id}/service-history`),
    enabled: !!id,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVehicleInput) => api.post<Vehicle>("/vehicles", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"], exact: false }),
  });
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateVehicleInput) => api.patch<Vehicle>(`/vehicles/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"], exact: false }),
  });
}
