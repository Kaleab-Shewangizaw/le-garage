"use client";

import { Lock } from "lucide-react";
import type { OrganizationKind } from "@le-garage/types";
import { useAuth } from "@/hooks/use-auth";
import { useIsPlatformAdmin } from "@/hooks/use-org";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-pill";
import { formatDateTime } from "@/lib/format";
import type { AdminAuditEntry } from "@/lib/api-types";

/** Every admin page renders only for PLATFORM_ADMIN; the API enforces the same rule (AdminController). */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  const isAdmin = useIsPlatformAdmin();
  if (!me) return <Skeleton className="h-40 w-full" />;
  if (!isAdmin) {
    return <EmptyState icon={Lock} title="This area is for Le Garage platform staff" description="You don't have access to the platform console." />;
  }
  return <>{children}</>;
}

const KIND_LABEL: Record<OrganizationKind, string> = { FLEET: "Fleet", GARAGE: "Garage", PLATFORM: "Platform" };

export function KindBadge({ kind }: { kind: OrganizationKind }) {
  return <Badge tone={kind === "FLEET" ? "attention" : "neutral"}>{KIND_LABEL[kind]}</Badge>;
}

export function SuspendedBadge() {
  return <Badge tone="danger">Suspended</Badge>;
}

/** "JOB_STATUS_CHANGED" → "Job status changed". */
export function humanizeAction(action: string): string {
  const words = action.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function AuditList({ entries, showOrganization = false }: { entries: AdminAuditEntry[]; showOrganization?: boolean }) {
  if (entries.length === 0) return <p className="text-[13px] text-graphite">No activity recorded yet.</p>;
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-surface">
      {entries.map((e) => (
        <div key={e.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
          <div className="min-w-0">
            <p className={`text-[13px] ${e.action.startsWith("ADMIN_") ? "font-medium text-ink" : "text-ink"}`}>
              {humanizeAction(e.action)}
              <span className="ml-1.5 text-[11.5px] text-muted">{e.entityType}</span>
            </p>
            <p className="truncate text-[12px] text-graphite">
              {e.actorUser?.fullName ?? "System / unknown"}
              {showOrganization && e.organization && ` · ${e.organization.name}`}
            </p>
          </div>
          <p className="shrink-0 font-mono text-[11.5px] text-muted">{formatDateTime(e.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}
