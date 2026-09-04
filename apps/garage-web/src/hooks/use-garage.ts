import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateGarageInput } from "@le-garage/validation";
import { api } from "@/lib/api-client";
import type { Garage } from "@/lib/api-types";

export function useGarage() {
  return useQuery({
    queryKey: ["garage"],
    queryFn: () => api.get<Garage>("/garages/me"),
  });
}

export function useUpdateGarage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGarageInput) => api.patch<Garage>("/garages/me", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["garage"] }),
  });
}
