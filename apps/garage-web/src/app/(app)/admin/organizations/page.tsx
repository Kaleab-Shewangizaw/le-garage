"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import type { OrganizationKind } from "@le-garage/types";
import { useAdminOrganizations } from "@/hooks/use-admin";
import { AdminOnly, KindBadge, SuspendedBadge } from "@/components/admin/admin-shared";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";

export default function AdminOrganizationsPage() {
  return (
    <AdminOnly>
      <Organizations />
    </AdminOnly>
  );
}

function Organizations() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"ALL" | OrganizationKind>("ALL");
  const orgs = useAdminOrganizations(search || undefined, kind === "ALL" ? undefined : kind);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Organizations</h1>
        <p className="mt-0.5 text-[13.5px] text-graphite">Fleet companies and garages using Le Garage.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="FLEET">Fleets</TabsTrigger>
            <TabsTrigger value="GARAGE">Garages</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      {orgs.isLoading ? (
        <SkeletonRows count={5} />
      ) : orgs.isError ? (
        <EmptyState icon={Building2} title="Couldn't load organizations" description={humanizeApiError(orgs.error)} />
      ) : (orgs.data ?? []).length === 0 ? (
        <EmptyState icon={Building2} title={search ? "No organizations match that name" : "No organizations yet"} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-[11.5px] font-medium uppercase tracking-wide text-graphite">
                <th className="px-4 py-2">Organization</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">People</th>
                <th className="px-3 py-2 text-right">Vehicles</th>
                <th className="px-3 py-2 text-right">Open work</th>
                <th className="px-4 py-2 text-right">Joined</th>
              </tr>
            </thead>
            <tbody>
              {orgs.data!.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/organizations/${o.id}`} className="flex items-center gap-2 font-medium text-ink hover:underline">
                      {o.name}
                      {o.suspendedAt && <SuspendedBadge />}
                    </Link>
                    {o.garage?.phone && <p className="font-mono text-[11.5px] text-muted">{o.garage.phone}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <KindBadge kind={o.kind} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-graphite">{o.staffCount}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-graphite">{o.vehicleCount}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-graphite">{o.openJobs}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
