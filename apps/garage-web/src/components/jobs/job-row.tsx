import Link from "next/link";
import type { JobListItem } from "@/lib/api-types";
import { JobStatusPill } from "@/components/ui/status-pill";
import { InitialsAvatar } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/format";
import { JobTimeline } from "@/components/jobs/job-timeline";

/**
 * A job row needs to communicate enough for a garage owner to scan dozens
 * of jobs without opening any of them (docs/UX.md §"Jobs Screen", brief
 * §11): the car, the plate, the complaint, who's on it, and where it is.
 */
export function JobRow({ job }: { job: JobListItem }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-black/[0.02] sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[13.5px] font-medium text-ink">
            {job.vehicle.make} {job.vehicle.model}
          </p>
          <p className="shrink-0 font-mono text-[12px] text-graphite">{job.vehicle.licensePlate}</p>
        </div>
        <p className="truncate text-[12.5px] text-graphite">{job.customer.fullName} · {job.complaint}</p>
      </div>

      <div className="hidden shrink-0 lg:block">
        <JobTimeline status={job.status} compact />
      </div>

      <div className="w-[132px] shrink-0">
        <JobStatusPill status={job.status} />
      </div>

      <div className="hidden w-8 shrink-0 justify-center sm:flex">
        {job.assignedTechnician ? (
          <InitialsAvatar name={job.assignedTechnician.user.fullName} />
        ) : (
          <span className="text-[11px] text-muted">—</span>
        )}
      </div>

      <div className="hidden w-16 shrink-0 text-right font-mono text-[12px] text-muted sm:block">
        {formatRelativeTime(job.intakeAt)}
      </div>
    </Link>
  );
}
