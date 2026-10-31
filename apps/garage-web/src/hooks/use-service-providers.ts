import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateServiceProviderInput, UpdateServiceProviderInput } from "@le-garage/validation";
import { api } from "@/lib/api-client";
import type { DirectoryGarage, ServiceProvider } from "@/lib/api-types";

export function useServiceProviders(includeInactive = false) {
  return useQuery({
    queryKey: ["service-providers", { includeInactive }],
    queryFn: () => api.get<ServiceProvider[]>("/service-providers", { includeInactive }),
  });
}

export function useCreateServiceProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceProviderInput) => api.post<ServiceProvider>("/service-providers", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-providers"], exact: false }),
  });
}

export function useUpdateServiceProvider(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateServiceProviderInput) => api.patch<ServiceProvider>(`/service-providers/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-providers"], exact: false }),
  });
}

export function useGarageDirectory(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["service-providers", "directory", search],
    queryFn: () => api.get<DirectoryGarage[]>("/service-providers/directory", { search: search || undefined }),
    enabled,
  });
}
