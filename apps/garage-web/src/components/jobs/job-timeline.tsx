import { Check, PauseCircle, XCircle } from "lucide-react";
import type { JobStatus } from "@le-garage/types";
import { JOB_STAGE_SHORT_LABEL, JOB_TIMELINE_STAGES } from "@/lib/job-labels";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STAGE_TIMESTAMP_FIELD: Partial<Record<(typeof JOB_TIMELINE_STAGES)[number], string>> = {
  INTAKE: "intakeAt",
  DIAGNOSING: "diagnosingAt",
  WAITING_APPROVAL: "waitingApprovalAt",
  APPROVED: "approvedAt",
  IN_PROGRESS: "inProgressAt",
  QUALITY_CHECK: "qualityCheckAt",
  READY: "readyAt",
  COLLECTED: "collectedAt",
};

export interface JobTimelineTimestamps {
  intakeAt?: string | null;
  diagnosingAt?: string | null;
  waitingApprovalAt?: string | null;
  approvedAt?: string | null;
  inProgressAt?: string | null;
  qualityCheckAt?: string | null;
  readyAt?: string | null;
  collectedAt?: string | null;
}

/**
 * The digital job card's spine, made visible: a connected line of stages
 * a real garage ticket physically moves through. This is deliberately the
 * one recognizable motif of the product — it appears (in compact form) on
 * every job row and (in full form) at the top of every job detail page,
 * so a garage owner or a customer looking over their shoulder can read
 * "where is this car right now" at a glance, without reading any labels.
 *
 * Only `status` is required — the compact list-row rendering doesn't need
 * per-stage timestamps, and the full job-detail rendering passes them.
 */
export function JobTimeline({
  status,
  timestamps,
  compact = false,
}: {
  status: JobStatus;
  timestamps?: JobTimelineTimestamps;
  compact?: boolean;
}) {
  if (status === "ON_HOLD") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-signal-soft px-3 py-2 text-[13px] text-signal-hover">
        <PauseCircle className="h-4 w-4 shrink-0" />
        <span>On hold — work is paused</span>
      </div>
    );
  }
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
        <XCircle className="h-4 w-4 shrink-0" />
        <span>Job cancelled</span>
      </div>
    );
  }

  const currentIndex = JOB_TIMELINE_STAGES.indexOf(
    status === "WAITING_PARTS" ? "IN_PROGRESS" : status === "CLOSED" ? "COLLECTED" : status,
  );

  // Full (non-compact) mode needs real horizontal room for 8 labeled
  // stages — rather than squeezing them until the labels collide on a
  // narrow phone (brief §12 "usable... not simply make everything
  // tiny"), the row scrolls horizontally below a minimum width and stays
  // legible; compact mode (list rows) has no labels so it never needs this.
  return (
    <div className={cn(!compact && "-mx-0.5 overflow-x-auto px-0.5")}>
      <div className={cn("flex items-start", compact ? "gap-0" : "w-full min-w-[640px]")}>
        {JOB_TIMELINE_STAGES.map((stage, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const timestampField = STAGE_TIMESTAMP_FIELD[stage];
        const timestamp = timestampField ? timestamps?.[timestampField as keyof JobTimelineTimestamps] : null;

        return (
          <div
            key={stage}
            className={cn(
              "flex flex-1 flex-col items-center",
              i === 0 && "flex-none items-start",
              i === JOB_TIMELINE_STAGES.length - 1 && "flex-none items-end",
            )}
          >
            <div className="flex w-full items-center">
              {i > 0 && <div className={cn("h-px flex-1", isDone || isCurrent ? "bg-ink" : "bg-line")} aria-hidden />}
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full transition-colors",
                  compact ? "h-4 w-4" : "h-6 w-6",
                  isDone && "bg-ink text-paper",
                  isCurrent && "bg-signal text-paper ring-4 ring-signal-soft",
                  !isDone && !isCurrent && "border-2 border-line bg-surface",
                )}
                title={JOB_STAGE_SHORT_LABEL[stage]}
              >
                {isDone && <Check className={compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} strokeWidth={3} />}
              </div>
              {i < JOB_TIMELINE_STAGES.length - 1 && (
                <div className={cn("h-px flex-1", isDone ? "bg-ink" : "bg-line")} aria-hidden />
              )}
            </div>
            {!compact && (
              <div className="mt-2 text-center">
                <p className={cn("text-[12px] font-medium", isCurrent ? "text-ink" : isDone ? "text-graphite" : "text-muted")}>
                  {JOB_STAGE_SHORT_LABEL[stage]}
                </p>
                {timestamp && <p className="mt-0.5 font-mono text-[11px] text-muted">{formatDateTime(timestamp)}</p>}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
