import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CustomerLink, CustomerMatch } from "@/lib/api-types";

export function useCustomerMatches() {
  return useQuery({
    queryKey: ["customer-matches"],
    queryFn: () => api.get<CustomerMatch[]>("/owner/customer-matches"),
  });
}

export function useCustomerLinks() {
  return useQuery({
    queryKey: ["customer-links"],
    queryFn: () => api.get<CustomerLink[]>("/owner/customer-links"),
  });
}

export function useConfirmCustomerLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) => api.post("/owner/customer-links", { customerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-links"] });
      queryClient.invalidateQueries({ queryKey: ["customer-matches"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}
