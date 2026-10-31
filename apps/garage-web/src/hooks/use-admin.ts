import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUpdateStaffInput, SuspendOrganizationInput } from "@le-garage/validation";
import type { OrganizationKind } from "@le-garage/types";
import { api } from "@/lib/api-client";
import type { AdminAuditEntry, AdminOrganizationDetail, AdminOrganizationRow, AdminOverview } from "@/lib/api-types";

export function useAdminOverview() {
  return useQuery({ queryKey: ["admin", "overview"], queryFn: () => api.get<AdminOverview>("/admin/overview") });
}

export function useAdminOrganizations(search?: string, kind?: OrganizationKind) {
  return useQuery({
    queryKey: ["admin", "organizations", search, kind],
    queryFn: () => api.get<AdminOrganizationRow[]>("/admin/organizations", { search, kind }),
  });
}

export function useAdminOrganization(id: string) {
  return useQuery({
    queryKey: ["admin", "organizations", id],
    queryFn: () => api.get<AdminOrganizationDetail>(`/admin/organizations/${id}`),
  });
}

export function useAdminAudit(filters: { organizationId?: string; action?: string } = {}) {
  return useQuery({
    queryKey: ["admin", "audit", filters],
    queryFn: () => api.get<AdminAuditEntry[]>("/admin/audit", { ...filters, limit: 150 }),
  });
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admin"], exact: false });
}

export function useSuspendOrganization(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (input: SuspendOrganizationInput) => api.post(`/admin/organizations/${id}/suspend`, input),
    onSuccess: invalidate,
  });
}

export function useReactivateOrganization(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: () => api.post(`/admin/organizations/${id}/reactivate`),
    onSuccess: invalidate,
  });
}

export function useAdminUpdateStaff() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ staffId, input }: { staffId: string; input: AdminUpdateStaffInput }) => api.patch(`/admin/staff/${staffId}`, input),
    onSuccess: invalidate,
  });
}
