import type { OrganizationKind } from "@le-garage/types";
import { useAuth } from "@/hooks/use-auth";
import { jobLabelsFor, type JobLabels } from "@/lib/job-labels";

/** Which kind of organization the signed-in staff member works for; undefined until /auth/me loads. */
export function useOrgKind(): OrganizationKind | undefined {
  const { me } = useAuth();
  return me?.staffMember?.organization?.kind;
}

export function useIsFleet(): boolean {
  return useOrgKind() === "FLEET";
}

/** Stage names and next actions in the signed-in organization's own vocabulary. */
export function useJobLabels(): JobLabels {
  return jobLabelsFor(useOrgKind());
}

export function useIsPlatformAdmin(): boolean {
  const { me } = useAuth();
  return me?.staffMember?.role === "PLATFORM_ADMIN";
}

/** Owners and supervisors approve spend and see financial reports (ApprovalsService, ReportsController). */
export function useCanApproveSpend(): boolean {
  const { me } = useAuth();
  const role = me?.staffMember?.role;
  return role === "OWNER" || role === "MANAGER";
}
