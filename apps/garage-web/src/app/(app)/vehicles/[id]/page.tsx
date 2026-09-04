"use client";

import { use } from "react";
import Link from "next/link";
import { FileClock, ShieldCheck } from "lucide-react";
import { useVehicle, useVehicleJobHistory, useVehicleServiceHistory } from "@/hooks/use-vehicles";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { JobStatusPill } from "@/components/ui/status-pill";
import { Section } from "@/components/ui/card";
import { formatDate, formatMileage, formatMoney } from "@/lib/format";

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vehicle = useVehicle(id);
  const jobHistory = useVehicleJobHistory(id);
  const serviceHistory = useVehicleServiceHistory(id);

  if (vehicle.isLoading || !vehicle.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const v = vehicle.data;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">
            {v.make} {v.model} {v.year ? `(${v.year})` : ""}
          </h1>
          <span className="rounded-sm bg-black/[0.05] px-1.5 py-0.5 font-mono text-[12.5px] font-medium text-ink">{v.licensePlate}</span>
        </div>
        <p className="mt-1 text-[13px] text-graphite">
          {v.color && `${v.color} · `}
          {formatMileage(v.lastKnownMileage)}
          {v.vin && <span className="font-mono"> · VIN {v.vin}</span>}
        </p>
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

      <Section title="All jobs">
        {jobHistory.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (jobHistory.data ?? []).length === 0 ? (
          <EmptyState icon={FileClock} title="No jobs yet" />
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {jobHistory.data!.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-black/[0.02]">
                <div>
                  <p className="text-[13px] text-ink">{job.complaint}</p>
                  <p className="text-[11.5px] text-graphite">{formatDate(job.intakeAt)}</p>
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
