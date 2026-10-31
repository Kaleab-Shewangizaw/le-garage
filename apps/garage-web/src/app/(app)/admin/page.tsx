"use client";

import Link from "next/link";
import { Building2, CarFront, Truck, UserCircle, Wrench, ShieldAlert } from "lucide-react";
import { useAdminAudit, useAdminOverview } from "@/hooks/use-admin";
import { AdminOnly, AuditList, KindBadge, SuspendedBadge } from "@/components/admin/admin-shared";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";

/** Le Garage's own view across every customer organization (docs/ADMIN.md). */
export default function AdminHomePage() {
  return (
    <AdminOnly>
      <AdminHome />
    </AdminOnly>
  );
}

function AdminHome() {
  const overview = useAdminOverview();
  const adminActions = useAdminAudit({ action: "ADMIN_" });
  const o = overview.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Platform</h1>
        <p className="mt-0.5 text-[13.5px] text-graphite">Every organization on Le Garage, and who can access them.</p>
      </div>

      {overview.isError ? (
        <EmptyState icon={ShieldAlert} title="Couldn't load the platform overview" description={humanizeApiError(overview.error)} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile icon={Truck} label="Fleet companies" value={o?.organizationsByKind.FLEET ?? 0} loading={overview.isLoading} />
          <Tile icon={Building2} label="Garages" value={o?.organizationsByKind.GARAGE ?? 0} loading={overview.isLoading} />
          <Tile icon={ShieldAlert} label="Suspended" value={o?.suspendedOrganizations} loading={overview.isLoading} />
          <Tile icon={UserCircle} label="User accounts" value={o?.users} loading={overview.isLoading} />
          <Tile icon={CarFront} label="Vehicles" value={o?.vehicles} loading={overview.isLoading} />
          <Tile icon={Wrench} label="Open jobs & repairs" value={o?.openJobs} loading={overview.isLoading} />
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Newest organizations</h2>
          <Link href="/admin/organizations" className="text-[12.5px] font-medium text-graphite hover:text-ink">
            All organizations →
          </Link>
        </div>
        {overview.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {o?.recentOrganizations.map((org) => (
              <Link key={org.id} href={`/admin/organizations/${org.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02]">
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{org.name}</p>
                {org.suspendedAt && <SuspendedBadge />}
                <KindBadge kind={org.kind} />
                <p className="hidden w-24 text-right font-mono text-[12px] text-muted sm:block">{formatDate(org.createdAt)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Recent admin actions</h2>
          <Link href="/admin/audit" className="text-[12.5px] font-medium text-graphite hover:text-ink">
            Full audit log →
          </Link>
        </div>
        {adminActions.isLoading ? <Skeleton className="h-24 w-full" /> : <AuditList entries={(adminActions.data ?? []).slice(0, 8)} showOrganization />}
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, loading }: { icon: React.ElementType; label: string; value: number | undefined; loading: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <Icon className="h-4 w-4 text-graphite" strokeWidth={1.75} />
      {loading ? <Skeleton className="mt-3 h-6 w-12" /> : <p className="mt-2.5 font-mono text-[20px] font-semibold leading-none text-ink">{value ?? "—"}</p>}
      <p className="mt-1.5 text-[12px] text-graphite">{label}</p>
    </div>
  );
}
