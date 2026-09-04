import { cn } from "@/lib/utils";
import type { JobStatus } from "@le-garage/types";
import { JOB_STAGE_LABEL, stageTone } from "@/lib/job-labels";

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
  const tone = stageTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[12.5px] font-medium leading-5",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {JOB_STAGE_LABEL[status]}
    </span>
  );
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
