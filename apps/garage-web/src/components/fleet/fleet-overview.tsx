"use client";

import Link from "next/link";
import { AlertTriangle, CarFront, Clock, CreditCard, ThumbsUp, Wallet, Wrench } from "lucide-react";
import { useFleetSummary } from "@/hooks/use-reports";
import { useJobs } from "@/hooks/use-jobs";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { JobRow } from "@/components/jobs/job-row";
import { JobStatusPill, VehicleStatusPill } from "@/components/ui/status-pill";
import { RequestServiceSheet } from "@/components/fleet/request-service-sheet";
import { formatMoney, formatRelativeTime } from "@/lib/format";

/**
 * The owner's and supervisor's first screen (docs/FLEET.md): which vehicles are off
 * the road, which repairs are waiting on *their* decision, and what this
 * month has cost so far. Every number is read from recorded repairs and
 * invoices — there are no projections or savings estimates here.
 */
export function FleetOverview() {
  const { me } = useAuth();
  const role = me?.staffMember?.role;
  // Mechanics don't get the financial summary (ReportsController) — they see their work queue.
  const canSeeSummary = role === "OWNER" || role === "MANAGER" || role === "FRONT_DESK";
  const summary = useFleetSummary(canSeeSummary);
  const openJobs = useJobs();

  const s = summary.data;
  const available = s?.vehiclesByStatus.ACTIVE ?? 0;
  const offRoad = (s?.vehiclesByStatus.IN_MAINTENANCE ?? 0) + (s?.vehiclesByStatus.UNAVAILABLE ?? 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Overview</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">Vehicles off the road, decisions waiting on you, and spend so far.</p>
        </div>
        <RequestServiceSheet trigger={<Button>Request service</Button>} />
      </div>

      {canSeeSummary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile icon={CarFront} label="Available" value={s ? available : undefined} loading={summary.isLoading} tone="good" />
          <StatTile icon={AlertTriangle} label="Off the road" value={s ? offRoad : undefined} loading={summary.isLoading} tone="attention" />
          <StatTile icon={Wrench} label="Open repairs" value={s?.openRepairs} loading={summary.isLoading} />
          <StatTile icon={Clock} label="Awaiting approval" value={s?.awaitingApproval.length} loading={summary.isLoading} tone="attention" />
          <StatTile icon={Wallet} label="Spent this month" value={s ? formatMoney(s.spendThisMonth) : undefined} loading={summary.isLoading} />
          <StatTile icon={CreditCard} label="Unpaid to providers" value={s ? formatMoney(s.outstandingBalance) : undefined} loading={summary.isLoading} />
        </div>
      )}

      {summary.isError && (
        <EmptyState icon={AlertTriangle} title="Couldn't load the fleet summary" description="Check your connection and refresh the page." />
      )}

      {canSeeSummary && (
        <div>
          <h2 className="eyebrow mb-3">Waiting for approval</h2>
          {summary.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !s || s.awaitingApproval.length === 0 ? (
            <EmptyState icon={ThumbsUp} title="No estimates waiting" description="Repairs submitted for approval will show up here." />
          ) : (
            <div className="divide-y divide-line rounded-lg border border-line bg-surface">
              {s.awaitingApproval.map((item) => (
                <Link
                  key={item.jobId}
                  href={`/jobs/${item.jobId}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-black/[0.02] sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">
                      {item.vehicle.make} {item.vehicle.model}{" "}
                      <span className="font-mono text-[12px] font-normal text-graphite">{item.vehicle.licensePlate}</span>
                    </p>
                    <p className="truncate text-[12.5px] text-graphite">
                      {item.serviceProvider?.name ?? "No provider"} · {item.complaint}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-[13px] font-semibold text-ink">
                    {item.estimateTotal != null ? formatMoney(item.estimateTotal) : "—"}
                  </p>
                  <p className="hidden w-16 shrink-0 text-right font-mono text-[12px] text-muted sm:block">
                    {item.waitingSince ? formatRelativeTime(item.waitingSince) : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {canSeeSummary && (
        <div>
          <h2 className="eyebrow mb-3">Off the road</h2>
          {summary.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !s || s.outOfService.length === 0 ? (
            <EmptyState icon={CarFront} title="Every vehicle is available" />
          ) : (
            <div className="divide-y divide-line rounded-lg border border-line bg-surface">
              {s.outOfService.map(({ vehicle, openRepair }) => (
                <Link
                  key={vehicle.id}
                  href={openRepair ? `/jobs/${openRepair.id}` : `/vehicles/${vehicle.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-black/[0.02] sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">
                      {vehicle.make} {vehicle.model}{" "}
                      <span className="font-mono text-[12px] font-normal text-graphite">{vehicle.licensePlate}</span>
                    </p>
                    <p className="truncate text-[12.5px] text-graphite">{openRepair?.complaint ?? "No open repair — marked unavailable"}</p>
                  </div>
                  {openRepair ? <JobStatusPill status={openRepair.status} /> : <VehicleStatusPill status={vehicle.status} />}
                  <p className="hidden w-20 shrink-0 text-right font-mono text-[12px] text-muted sm:block">
                    {openRepair ? `since ${formatRelativeTime(openRepair.intakeAt).replace(" ago", "")}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {!canSeeSummary && (
        <div>
          <h2 className="eyebrow mb-3">Open repairs</h2>
          {openJobs.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (openJobs.data ?? []).filter((j) => !["COLLECTED", "CLOSED", "CANCELLED"].includes(j.status)).length === 0 ? (
            <EmptyState icon={ThumbsUp} title="No open repairs" />
          ) : (
            <div className="divide-y divide-line rounded-lg border border-line bg-surface">
              {openJobs.data!
                .filter((j) => !["COLLECTED", "CLOSED", "CANCELLED"].includes(j.status))
                .map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
            </div>
          )}
        </div>
      )}

      <div className="text-center">
        <Link href="/jobs" className="text-[13px] font-medium text-graphite hover:text-ink">
          View all repairs →
        </Link>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
  tone = "neutral",
}: {
  icon: React.ElementType;
  label: string;
  value: number | string | undefined;
  loading: boolean;
  tone?: "neutral" | "attention" | "good";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <Icon
        className={`h-4 w-4 ${tone === "attention" ? "text-signal" : tone === "good" ? "text-good" : "text-graphite"}`}
        strokeWidth={1.75}
      />
      {loading ? (
        <Skeleton className="mt-3 h-6 w-12" />
      ) : (
        <p className="mt-2.5 truncate font-mono text-[20px] font-semibold leading-none text-ink">{value ?? "—"}</p>
      )}
      <p className="mt-1.5 text-[12px] text-graphite">{label}</p>
    </div>
  );
}
