"use client";

import { History } from "lucide-react";
import { useJobEvents } from "@/hooks/use-jobs";
import { useJobLabels } from "@/hooks/use-org";
import { formatDateTime } from "@/lib/format";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export function ActivityTab({ jobId }: { jobId: string }) {
  const events = useJobEvents(jobId);
  const labels = useJobLabels();

  if (events.isLoading) return <SkeletonRows count={4} />;
  if (!events.data || events.data.length === 0) {
    return <EmptyState icon={History} title="No activity yet" />;
  }

  return (
    <div className="relative space-y-0 pl-5">
      <div className="absolute bottom-1 left-[3px] top-1 w-px bg-line" aria-hidden />
      {[...events.data].reverse().map((event) => (
        <div key={event.id} className="relative pb-5 last:pb-0">
          <div className="absolute -left-5 top-1 h-[7px] w-[7px] rounded-full bg-ink" aria-hidden />
          <p className="text-[13px] text-ink">
            {event.fromStatus ? (
              <>
                Moved from <span className="font-medium">{labels.stage[event.fromStatus]}</span> to{" "}
                <span className="font-medium">{labels.stage[event.toStatus]}</span>
              </>
            ) : (
              <>
                {labels.noun === "repair" ? "Service requested as" : "Job created as"} <span className="font-medium">{labels.stage[event.toStatus]}</span>
              </>
            )}
          </p>
          {event.note && <p className="mt-0.5 text-[12.5px] text-graphite">&ldquo;{event.note}&rdquo;</p>}
          <p className="mt-0.5 font-mono text-[11px] text-muted">{formatDateTime(event.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}
