"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, FileClock, ShieldCheck } from "lucide-react";
import type { VehicleStatus } from "@le-garage/types";
import { useUpdateVehicle, useVehicle, useVehicleJobHistory, useVehicleServiceHistory } from "@/hooks/use-vehicles";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { JobStatusPill, VehicleStatusPill } from "@/components/ui/status-pill";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { RequestServiceSheet } from "@/components/fleet/request-service-sheet";
import { VehicleProfile } from "@/components/fleet/vehicle-profile";
import { useIsFleet } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { VEHICLE_STATUS_LABEL, VEHICLE_TYPE_LABEL } from "@/lib/job-labels";
import type { Vehicle } from "@/lib/api-types";
import { formatDate, formatMileage, formatMoney } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vehicle = useVehicle(id);
  const jobHistory = useVehicleJobHistory(id);
  const serviceHistory = useVehicleServiceHistory(id);
  const isFleet = useIsFleet();

  // Fleet companies get the full vehicle profile (details, visits, photo proof).
  if (isFleet) return <VehicleProfile id={id} />;

  if (vehicle.isError) {
    return <EmptyState icon={AlertTriangle} title="Couldn't load this vehicle" description="It may have been removed, or you may not have access to it." />;
  }

  if (vehicle.isLoading || !vehicle.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const v = vehicle.data;
  const historyTotal = (serviceHistory.data ?? []).reduce((sum, r) => sum + (r.summary.invoice?.total ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">
            {v.make} {v.model} {v.year ? `(${v.year})` : ""}
          </h1>
          <span className="rounded-sm bg-black/[0.05] px-1.5 py-0.5 font-mono text-[12.5px] font-medium text-ink">{v.licensePlate}</span>
        </div>
        <p className="mt-1 text-[13px] text-graphite">
          {v.color && `${v.color} · `}
          {formatMileage(v.lastKnownMileage)}
          {v.vin && <span className="font-mono"> · VIN {v.vin}</span>}
          {isFleet && v.vehicleType && ` · ${VEHICLE_TYPE_LABEL[v.vehicleType]}`}
        </p>
        {isFleet && serviceHistory.data && serviceHistory.data.length > 0 && (
          <p className="mt-1 text-[12.5px] text-graphite">
            {serviceHistory.data.length} completed repair{serviceHistory.data.length === 1 ? "" : "s"} ·{" "}
            <span className="font-mono">{formatMoney(historyTotal)}</span> invoiced in total
          </p>
        )}
      </div>
      {isFleet && (
        <div className="flex flex-wrap items-center gap-2">
          <VehicleStatusControl vehicle={v} />
          {v.status !== "RETIRED" && <RequestServiceSheet vehicle={v} trigger={<Button>Request service</Button>} />}
        </div>
      )}
      </div>

      <Section title="Service history" action={<span className="text-[11.5px] text-muted">The permanent record — what happened to this car</span>}>
        {serviceHistory.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (serviceHistory.data ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No service history yet" description="A record is created automatically each time a job is completed and the vehicle is collected." />
        ) : (
          <div className="space-y-3">
            {serviceHistory.data!.map((record) => (
              <div key={record.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13.5px] font-medium text-ink">{record.summary.complaint}</p>
                    <p className="mt-0.5 text-[12px] text-graphite">
                      {formatDate(record.serviceDate)} · {formatMileage(record.mileage)}
                    </p>
                  </div>
                  {record.summary.invoice && (
                    <p className="font-mono text-[13.5px] font-semibold text-ink">{formatMoney(record.summary.invoice.total, record.summary.invoice.currency)}</p>
                  )}
                </div>
                {record.summary.workPerformed.parts.length + record.summary.workPerformed.labor.length > 0 && (
                  <p className="mt-2.5 text-[12.5px] text-graphite">
                    {[...record.summary.workPerformed.parts.map((p) => p.name), ...record.summary.workPerformed.labor.map((l) => l.description)].join(" · ")}
                  </p>
                )}
                {record.summary.warrantyMonths && (
                  <p className="mt-2 text-[11.5px] text-good">Warranty: {record.summary.warrantyMonths} months</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={isFleet ? "All repairs" : "All jobs"}>
        {jobHistory.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (jobHistory.data ?? []).length === 0 ? (
          <EmptyState icon={FileClock} title={isFleet ? "No repairs yet" : "No jobs yet"} />
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {jobHistory.data!.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-black/[0.02]">
                <div>
                  <p className="text-[13px] text-ink">{job.complaint}</p>
                  <p className="text-[11.5px] text-graphite">
                    {formatDate(job.intakeAt)}
                    {job.serviceProvider && ` · ${job.serviceProvider.name}`}
                  </p>
                </div>
                <JobStatusPill status={job.status} />
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/**
 * Manual availability (docs/FLEET.md). IN_MAINTENANCE is managed by repairs
 * themselves, so it isn't offered as a manual choice — a manager can take a
 * vehicle off the road (unavailable), retire it, or put it back in service.
 * The API rejects this for mechanics; the control is hidden for them too.
 */
function VehicleStatusControl({ vehicle }: { vehicle: Vehicle }) {
  const { me } = useAuth();
  const update = useUpdateVehicle(vehicle.id);
  const canChange = me?.staffMember && me.staffMember.role !== "TECHNICIAN";

  if (!canChange) return <VehicleStatusPill status={vehicle.status} />;

  const options: VehicleStatus[] = ["ACTIVE", "UNAVAILABLE", "RETIRED"];

  async function handleChange(status: string) {
    if (status === vehicle.status) return;
    try {
      await update.mutateAsync({ status: status as VehicleStatus });
      toast.success(`Marked ${VEHICLE_STATUS_LABEL[status as VehicleStatus].toLowerCase()}`);
    } catch (err) {
      toast.error("Couldn't change the vehicle status", { description: humanizeApiError(err) });
    }
  }

  return (
    <Select value={vehicle.status} onValueChange={handleChange} disabled={update.isPending}>
      <SelectTrigger className="w-[170px]" aria-label="Vehicle status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {vehicle.status === "IN_MAINTENANCE" && <SelectItem value="IN_MAINTENANCE">In maintenance</SelectItem>}
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {VEHICLE_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
