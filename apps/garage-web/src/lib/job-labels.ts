import type { JobStatus } from "@le-garage/types";

/**
 * Human language for job stages (docs/UX.md §4 — "the interface should
 * use human language," not entity names). One place to change the wording
 * everywhere it appears: the board, the timeline, filters, actions.
 */
export const JOB_STAGE_LABEL: Record<JobStatus, string> = {
  INTAKE: "Just arrived",
  DIAGNOSING: "Diagnosing",
  WAITING_APPROVAL: "Waiting for approval",
  APPROVED: "Approved",
  WAITING_PARTS: "Waiting for parts",
  IN_PROGRESS: "Repairing",
  QUALITY_CHECK: "Quality check",
  READY: "Ready for pickup",
  COLLECTED: "Collected",
  ON_HOLD: "On hold",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
};

/** The main forward path shown in the job timeline (docs/UX.md — the "digital job card"). */
export const JOB_TIMELINE_STAGES: JobStatus[] = [
  "INTAKE",
  "DIAGNOSING",
  "WAITING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "QUALITY_CHECK",
  "READY",
  "COLLECTED",
];

export const JOB_STAGE_SHORT_LABEL: Record<JobStatus, string> = {
  INTAKE: "Intake",
  DIAGNOSING: "Diagnosis",
  WAITING_APPROVAL: "Approval",
  APPROVED: "Approved",
  WAITING_PARTS: "Parts",
  IN_PROGRESS: "Repair",
  QUALITY_CHECK: "QC",
  READY: "Ready",
  COLLECTED: "Collected",
  ON_HOLD: "On hold",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
};

/** Which stages should visually stand out on the board (docs/UX.md — color communicates meaning, sparingly). */
export function stageTone(status: JobStatus): "neutral" | "attention" | "good" | "danger" {
  if (status === "READY" || status === "COLLECTED" || status === "CLOSED") return "good";
  if (status === "WAITING_APPROVAL" || status === "WAITING_PARTS" || status === "ON_HOLD") return "attention";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

export interface JobNextAction {
  label: string;
  to: JobStatus;
  primary?: boolean;
  destructive?: boolean;
  /** Non-primary actions open a small confirm dialog (docs/UX.md — deliberate for less-common/destructive moves); primary is one click. */
  confirm?: boolean;
}

/**
 * Client-side suggestions only — mirrors (a subset of) the authoritative
 * transition table in apps/api/src/jobs/job-state-machine.ts, which is
 * still what actually validates every transition server-side. This exists
 * purely so the UI can show "the obvious next action" (brief §13) instead
 * of a generic status dropdown.
 */
export const JOB_NEXT_ACTIONS: Record<JobStatus, JobNextAction[]> = {
  INTAKE: [
    { label: "Start diagnosis", to: "DIAGNOSING", primary: true },
    { label: "Cancel job", to: "CANCELLED", destructive: true, confirm: true },
  ],
  DIAGNOSING: [
    { label: "Request approval", to: "WAITING_APPROVAL", primary: true },
    { label: "Put on hold", to: "ON_HOLD", confirm: true },
    { label: "Cancel job", to: "CANCELLED", destructive: true, confirm: true },
  ],
  WAITING_APPROVAL: [
    { label: "Mark approved", to: "APPROVED", primary: true },
    { label: "Revise estimate", to: "DIAGNOSING", confirm: true },
    { label: "Put on hold", to: "ON_HOLD", confirm: true },
    { label: "Customer declined — cancel", to: "CANCELLED", destructive: true, confirm: true },
  ],
  APPROVED: [
    { label: "Start repair", to: "IN_PROGRESS", primary: true },
    { label: "Waiting on parts", to: "WAITING_PARTS", confirm: true },
    { label: "Put on hold", to: "ON_HOLD", confirm: true },
  ],
  WAITING_PARTS: [
    { label: "Resume repair", to: "IN_PROGRESS", primary: true },
    { label: "Put on hold", to: "ON_HOLD", confirm: true },
  ],
  IN_PROGRESS: [
    { label: "Start quality check", to: "QUALITY_CHECK", primary: true },
    { label: "Waiting on parts", to: "WAITING_PARTS", confirm: true },
    { label: "Put on hold", to: "ON_HOLD", confirm: true },
  ],
  QUALITY_CHECK: [
    { label: "Mark ready for pickup", to: "READY", primary: true },
    { label: "Send back to repair", to: "IN_PROGRESS", confirm: true },
  ],
  READY: [{ label: "Complete job", to: "COLLECTED", primary: true, confirm: true }],
  ON_HOLD: [
    { label: "Resume diagnosis", to: "DIAGNOSING", confirm: true },
    { label: "Resume — waiting on approval", to: "WAITING_APPROVAL", confirm: true },
    { label: "Resume repair", to: "IN_PROGRESS", confirm: true },
    { label: "Cancel job", to: "CANCELLED", destructive: true, confirm: true },
  ],
  COLLECTED: [],
  CANCELLED: [],
  CLOSED: [],
};
