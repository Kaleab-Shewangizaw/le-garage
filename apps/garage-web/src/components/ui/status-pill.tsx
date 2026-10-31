"use client";

import { cn } from "@/lib/utils";
import type { JobStatus, VehicleStatus } from "@le-garage/types";
import { stageTone, VEHICLE_STATUS_LABEL, vehicleStatusTone } from "@/lib/job-labels";
import { useJobLabels } from "@/hooks/use-org";

const TONE_CLASSES: Record<ReturnType<typeof stageTone>, string> = {
  neutral: "bg-black/[0.05] text-ink",
  attention: "bg-signal-soft text-signal-hover",
  good: "bg-good-soft text-good",
  danger: "bg-danger-soft text-danger",
};

/**
 * Status is communicated by color sparingly (docs/UX.md, brief §5) — most
 * stages render as a neutral pill; only the ones that genuinely need
 * attention (waiting/on hold) or represent a positive outcome (ready/
 * collected) get color.
 */
export function JobStatusPill({ status, className }: { status: JobStatus; className?: string }) {
  const labels = useJobLabels();
  const tone = stageTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[12.5px] font-medium leading-5",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {labels.stage[status]}
    </span>
  );
}

/** Fleet vehicle availability (docs/FLEET.md). */
export function VehicleStatusPill({ status, className }: { status: VehicleStatus; className?: string }) {
  return <Badge tone={vehicleStatusTone(status)} className={className}>{VEHICLE_STATUS_LABEL[status]}</Badge>;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "attention" | "good" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[12.5px] font-medium leading-5",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
