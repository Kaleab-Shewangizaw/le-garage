import type { AttachmentTag, FuelType, JobStatus, OrganizationKind, VehicleStatus, VehicleType } from "@le-garage/types";

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

// ─────────────────────────────────────────────────────────────────────────
// Fleet wording (docs/FLEET.md). Same states and transitions as a garage
// job — only the words change, because a fleet is the vehicle's owner,
// not a workshop: "intake" is a service request, "collected" is
// the vehicle going back into service.
// ─────────────────────────────────────────────────────────────────────────

export const FLEET_STAGE_LABEL: Record<JobStatus, string> = {
  INTAKE: "Requested",
  DIAGNOSING: "Inspection",
  WAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  WAITING_PARTS: "Waiting for parts",
  IN_PROGRESS: "Repairing",
  QUALITY_CHECK: "Quality check",
  READY: "Repair complete",
  COLLECTED: "Back in service",
  ON_HOLD: "On hold",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
};

export const FLEET_STAGE_SHORT_LABEL: Record<JobStatus, string> = {
  ...JOB_STAGE_SHORT_LABEL,
  INTAKE: "Requested",
  DIAGNOSING: "Inspection",
  READY: "Done",
  COLLECTED: "In service",
};

/**
 * Fleet next actions. WAITING_APPROVAL has no "Mark approved" button: a
 * supervisor's approval on the Estimate tab moves the repair forward
 * itself (ApprovalsService), so a separate click would just be a way to
 * get it wrong.
 */
export const FLEET_NEXT_ACTIONS: Record<JobStatus, JobNextAction[]> = {
  ...JOB_NEXT_ACTIONS,
  INTAKE: [
    { label: "Start inspection", to: "DIAGNOSING", primary: true },
    { label: "Cancel repair", to: "CANCELLED", destructive: true, confirm: true },
  ],
  DIAGNOSING: [
    { label: "Submit for approval", to: "WAITING_APPROVAL", primary: true },
    { label: "Put on hold", to: "ON_HOLD", confirm: true },
    { label: "Cancel repair", to: "CANCELLED", destructive: true, confirm: true },
  ],
  WAITING_APPROVAL: [
    { label: "Revise estimate", to: "DIAGNOSING", confirm: true },
    { label: "Put on hold", to: "ON_HOLD", confirm: true },
    { label: "Cancel repair", to: "CANCELLED", destructive: true, confirm: true },
  ],
  QUALITY_CHECK: [
    { label: "Mark repair complete", to: "READY", primary: true },
    { label: "Send back to repair", to: "IN_PROGRESS", confirm: true },
  ],
  READY: [{ label: "Return to service", to: "COLLECTED", primary: true, confirm: true }],
  ON_HOLD: [
    { label: "Resume inspection", to: "DIAGNOSING", confirm: true },
    { label: "Resume — awaiting approval", to: "WAITING_APPROVAL", confirm: true },
    { label: "Resume repair", to: "IN_PROGRESS", confirm: true },
    { label: "Cancel repair", to: "CANCELLED", destructive: true, confirm: true },
  ],
};

export interface JobLabels {
  stage: Record<JobStatus, string>;
  short: Record<JobStatus, string>;
  nextActions: Record<JobStatus, JobNextAction[]>;
  /** "job" for a garage, "repair" for a fleet. */
  noun: string;
}

export function jobLabelsFor(kind: OrganizationKind | undefined): JobLabels {
  return kind === "FLEET"
    ? { stage: FLEET_STAGE_LABEL, short: FLEET_STAGE_SHORT_LABEL, nextActions: FLEET_NEXT_ACTIONS, noun: "repair" }
    : { stage: JOB_STAGE_LABEL, short: JOB_STAGE_SHORT_LABEL, nextActions: JOB_NEXT_ACTIONS, noun: "job" };
}

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  ACTIVE: "Active",
  IN_MAINTENANCE: "In maintenance",
  UNAVAILABLE: "Unavailable",
  RETIRED: "Retired",
};

export function vehicleStatusTone(status: VehicleStatus): "neutral" | "attention" | "good" | "danger" {
  if (status === "ACTIVE") return "good";
  if (status === "IN_MAINTENANCE") return "attention";
  if (status === "UNAVAILABLE") return "danger";
  return "neutral";
}

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  CAR: "Car",
  PICKUP: "Pickup",
  VAN: "Van",
  TRUCK: "Truck",
  MINIBUS: "Minibus",
  BUS: "Bus",
  MOTORCYCLE: "Motorcycle",
  OTHER: "Other",
};

/**
 * Fleet companies use the same four roles under fleet-native names
 * (docs/FLEET.md §5): the owner holds the account and oversees; a
 * supervisor runs day-to-day operations and approves spend.
 */
export const FLEET_ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Supervisor",
  FRONT_DESK: "Coordinator",
  TECHNICIAN: "Mechanic",
};

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  DIESEL: "Diesel",
  PETROL: "Petrol (benzene)",
  HYBRID: "Hybrid",
  ELECTRIC: "Electric",
  OTHER: "Other",
};

/** What a photo is evidence of (vehicle profile + repair photos). */
export const ATTACHMENT_TAG_LABEL: Record<AttachmentTag, string> = {
  VEHICLE_PROFILE: "Vehicle photo",
  CONDITION: "Condition",
  DAMAGE: "Damage",
  BEFORE_REPAIR: "Before repair",
  AFTER_REPAIR: "After repair",
  OLD_PART: "Replaced part",
  RECEIPT: "Receipt / invoice",
  DOCUMENT: "Document",
};

/** Tags offered when adding photos to a repair vs. to the vehicle itself. */
export const REPAIR_PHOTO_TAGS: AttachmentTag[] = ["BEFORE_REPAIR", "DAMAGE", "OLD_PART", "AFTER_REPAIR", "RECEIPT"];
export const VEHICLE_PHOTO_TAGS: AttachmentTag[] = ["VEHICLE_PROFILE", "CONDITION", "DAMAGE", "DOCUMENT"];
