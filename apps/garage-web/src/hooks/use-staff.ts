import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteStaffInput, UpdateStaffInput } from "@le-garage/validation";
import { api } from "@/lib/api-client";
import type { StaffMember } from "@/lib/api-types";

export function useStaff() {
  return useQuery({
    queryKey: ["staff"],
    queryFn: () => api.get<(StaffMember & { user: { fullName: string; email: string | null; phone: string | null } })[]>("/staff"),
  });
}

export function useInviteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteStaffInput) => api.post<StaffMember>("/staff/invite", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, input }: { staffId: string; input: UpdateStaffInput }) =>
      api.patch<StaffMember>(`/staff/${staffId}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}
