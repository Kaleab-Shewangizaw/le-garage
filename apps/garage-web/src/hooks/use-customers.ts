import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCustomerInput, UpdateCustomerInput } from "@le-garage/validation";
import { api } from "@/lib/api-client";
import type { Customer } from "@/lib/api-types";

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.get<Customer[]>("/customers", { search }),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () => api.get<Customer>(`/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => api.post<Customer>("/customers", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"], exact: false }),
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCustomerInput) => api.patch<Customer>(`/customers/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"], exact: false }),
  });
}
