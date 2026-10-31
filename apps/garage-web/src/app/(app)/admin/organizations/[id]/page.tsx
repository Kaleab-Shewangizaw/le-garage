"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Ban, RotateCcw } from "lucide-react";
import {
  useAdminOrganization,
  useAdminUpdateStaff,
  useReactivateOrganization,
  useSuspendOrganization,
} from "@/hooks/use-admin";
import { AdminOnly, AuditList, KindBadge, SuspendedBadge } from "@/components/admin/admin-shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-pill";
import { Section } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FLEET_ROLE_LABEL } from "@/lib/job-labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";
import type { AdminOrganizationDetail } from "@/lib/api-types";

const GARAGE_ROLE_LABEL: Record<string, string> = { OWNER: "Owner", MANAGER: "Manager", FRONT_DESK: "Front desk", TECHNICIAN: "Technician" };

export default function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminOnly>
      <OrganizationDetail id={id} />
    </AdminOnly>
  );
}

function OrganizationDetail({ id }: { id: string }) {
  const org = useAdminOrganization(id);

  if (org.isError) {
    return <EmptyState icon={AlertTriangle} title="Couldn't load this organization" description={humanizeApiError(org.error)} />;
  }
  if (org.isLoading || !org.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const o = org.data;
  const roleLabel = o.kind === "FLEET" ? FLEET_ROLE_LABEL : GARAGE_ROLE_LABEL;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/organizations" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-graphite hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Organizations
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight text-ink">{o.name}</h1>
              <KindBadge kind={o.kind} />
              {o.suspendedAt && <SuspendedBadge />}
            </div>
            <p className="mt-1 text-[13px] text-graphite">
              Joined {formatDate(o.createdAt)}
              {o.garage?.phone && <span className="font-mono"> · {o.garage.phone}</span>}
              {o.garage?.address && ` · ${o.garage.address}`}
            </p>
          </div>
          <AccessControl org={o} />
        </div>
        {o.suspendedAt && (
          <div className="mt-4 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            Suspended {formatDateTime(o.suspendedAt)} — nobody in this organization can sign in or use the app.
            {o.suspendedReason && <span className="block text-[12.5px]">Reason: {o.suspendedReason}</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Count label="Vehicles" value={o._count.vehicles} />
        <Count label="Open work" value={o.openJobs} />
        <Count label={o.kind === "FLEET" ? "Repairs (all time)" : "Jobs (all time)"} value={o._count.jobs} />
        <Count label={o.kind === "FLEET" ? "Service providers" : "Customers"} value={o.kind === "FLEET" ? o._count.serviceProviders : o._count.customers} />
      </div>

      <Section title="People" action={<span className="text-[11.5px] text-muted">Deactivating someone signs them out everywhere immediately</span>}>
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {o.staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{s.user.fullName}</p>
                <p className="truncate font-mono text-[12px] text-graphite">{s.user.email ?? s.user.phone}</p>
              </div>
              <span className="hidden text-[12.5px] text-graphite sm:block">{roleLabel[s.role] ?? s.role}</span>
              {!s.active && <Badge tone="danger">Deactivated</Badge>}
              <StaffAccessButton staffId={s.id} name={s.user.fullName} active={s.active} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recent activity">
        <AuditList entries={o.recentActivity} />
      </Section>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="font-mono text-[18px] font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[12px] text-graphite">{label}</p>
    </div>
  );
}

/** Suspend/reactivate a whole organization — a reason is required and audit-logged. */
function AccessControl({ org }: { org: AdminOrganizationDetail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const suspend = useSuspendOrganization(org.id);
  const reactivate = useReactivateOrganization(org.id);

  if (org.suspendedAt) {
    return (
      <Button
        variant="secondary"
        loading={reactivate.isPending}
        onClick={async () => {
          try {
            await reactivate.mutateAsync();
            toast.success(`${org.name} reactivated`);
          } catch (err) {
            toast.error("Couldn't reactivate", { description: humanizeApiError(err) });
          }
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reactivate
      </Button>
    );
  }

  return (
    <>
      <Button variant="secondary" className="text-danger hover:bg-danger-soft" onClick={() => setOpen(true)}>
        <Ban className="h-3.5 w-3.5" /> Suspend access
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {org.name}?</DialogTitle>
            <DialogDescription>
              Everyone in this organization is signed out and can&apos;t sign back in until you reactivate it. Their data is kept exactly as it is.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason">Reason (recorded in the audit log)</Label>
            <Textarea id="suspend-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Pilot paused at the company's request" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={suspend.isPending}
              disabled={reason.trim().length < 5}
              onClick={async () => {
                try {
                  await suspend.mutateAsync({ reason: reason.trim() });
                  toast.success(`${org.name} suspended`);
                  setOpen(false);
                  setReason("");
                } catch (err) {
                  toast.error("Couldn't suspend", { description: humanizeApiError(err) });
                }
              }}
            >
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StaffAccessButton({ staffId, name, active }: { staffId: string; name: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const update = useAdminUpdateStaff();

  async function submit() {
    try {
      await update.mutateAsync({ staffId, input: { active: !active, reason: reason.trim() } });
      toast.success(active ? `${name} deactivated` : `${name} reactivated`);
      setOpen(false);
      setReason("");
    } catch (err) {
      toast.error("Couldn't update access", { description: humanizeApiError(err) });
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" className={active ? "text-danger" : undefined} onClick={() => setOpen(true)}>
        {active ? "Deactivate" : "Reactivate"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active ? `Deactivate ${name}?` : `Reactivate ${name}?`}</DialogTitle>
            <DialogDescription>
              {active ? "They're signed out immediately and can't sign in to this organization." : "They'll be able to sign in again with their existing password."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${staffId}`}>Reason (recorded in the audit log)</Label>
            <Textarea id={`reason-${staffId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Lost phone — company asked us to lock the account" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={active ? "danger" : "primary"} loading={update.isPending} disabled={reason.trim().length < 5} onClick={submit}>
              {active ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
