"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarFront, Clock, CreditCard, PackageSearch, ThumbsUp, Wrench } from "lucide-react";
import { useDashboardSummary } from "@/hooks/use-dashboard";
import { useJobs } from "@/hooks/use-jobs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { JobRow } from "@/components/jobs/job-row";
import { formatMoney } from "@/lib/format";
import { useOrgKind } from "@/hooks/use-org";
import { FleetOverview } from "@/components/fleet/fleet-overview";

const ATTENTION_STATUSES = new Set(["WAITING_APPROVAL", "WAITING_PARTS", "ON_HOLD", "READY"]);

export default function OverviewPage() {
  const kind = useOrgKind();
  const router = useRouter();
  // Platform admins have no tenant of their own to overview — their home is the console.
  useEffect(() => {
    if (kind === "PLATFORM") router.replace("/admin");
  }, [kind, router]);
  if (!kind || kind === "PLATFORM") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return kind === "FLEET" ? <FleetOverview /> : <GarageOverview />;
}

function GarageOverview() {
  const summary = useDashboardSummary();
  const jobs = useJobs();

  const attentionJobs = (jobs.data ?? []).filter((j) => ATTENTION_STATUSES.has(j.status));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Overview</h1>
        <p className="mt-0.5 text-[13.5px] text-graphite">What needs your attention right now.</p>
      </div>

      {/* Today — the numbers a garage owner checks first thing. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={CarFront} label="In the garage" value={summary.data?.vehiclesCurrentlyInGarage} loading={summary.isLoading} />
        <StatTile icon={Wrench} label="New today" value={summary.data?.jobsIntakenToday} loading={summary.isLoading} />
        <StatTile icon={Clock} label="Awaiting approval" value={summary.data?.jobsAwaitingApproval} loading={summary.isLoading} tone="attention" />
        <StatTile icon={PackageSearch} label="Waiting on parts" value={summary.data?.jobsBlockedOnParts} loading={summary.isLoading} tone="attention" />
        <StatTile icon={ThumbsUp} label="Collected today" value={summary.data?.jobsCollectedToday} loading={summary.isLoading} tone="good" />
        <StatTile
          icon={CreditCard}
          label="Outstanding"
          value={summary.data ? formatMoney(summary.data.outstandingBalance) : undefined}
          loading={summary.isLoading}
        />
      </div>

      {/* Jobs needing attention — the actual work queue, not a chart. */}
      <div>
        <h2 className="eyebrow mb-3">Jobs needing attention</h2>
        {jobs.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : attentionJobs.length === 0 ? (
          <EmptyState
            icon={ThumbsUp}
            title="Nothing needs attention"
            description="Every job in the garage is moving along on its own — new work will show up here."
          />
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {attentionJobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>

      <div className="text-center">
        <Link href="/jobs" className="text-[13px] font-medium text-graphite hover:text-ink">
          View all jobs →
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
        <p className="mt-2.5 font-mono text-[20px] font-semibold leading-none text-ink">{value ?? "—"}</p>
      )}
      <p className="mt-1.5 text-[12px] text-graphite">{label}</p>
    </div>
  );
}
