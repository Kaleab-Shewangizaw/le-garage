import { JobStatus, Role } from "@le-garage/database";

export interface JobTransition {
  from: JobStatus;
  to: JobStatus;
  allowedRoles: Role[];
}

const STAFF_ALL: Role[] = [Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.TECHNICIAN];
const FRONT_OFFICE: Role[] = [Role.OWNER, Role.MANAGER, Role.FRONT_DESK];
const WORKSHOP: Role[] = [Role.OWNER, Role.MANAGER, Role.TECHNICIAN];

/**
 * The fixed job-status transition table (docs/DOMAIN.md §5). This is the
 * single place status transitions are validated — never a raw
 * `UPDATE ... SET status` anywhere else in the codebase.
 */
export const JOB_TRANSITIONS: JobTransition[] = [
  { from: JobStatus.INTAKE, to: JobStatus.DIAGNOSING, allowedRoles: STAFF_ALL },
  { from: JobStatus.INTAKE, to: JobStatus.CANCELLED, allowedRoles: FRONT_OFFICE },

  { from: JobStatus.DIAGNOSING, to: JobStatus.WAITING_APPROVAL, allowedRoles: FRONT_OFFICE },
  { from: JobStatus.DIAGNOSING, to: JobStatus.ON_HOLD, allowedRoles: STAFF_ALL },
  { from: JobStatus.DIAGNOSING, to: JobStatus.CANCELLED, allowedRoles: FRONT_OFFICE },

  // Revised estimate needed: garage goes back to diagnosing/estimating, not an edit of the sent estimate (DOMAIN.md §6).
  { from: JobStatus.WAITING_APPROVAL, to: JobStatus.DIAGNOSING, allowedRoles: FRONT_OFFICE },
  { from: JobStatus.WAITING_APPROVAL, to: JobStatus.APPROVED, allowedRoles: FRONT_OFFICE },
  { from: JobStatus.WAITING_APPROVAL, to: JobStatus.ON_HOLD, allowedRoles: STAFF_ALL },
  { from: JobStatus.WAITING_APPROVAL, to: JobStatus.CANCELLED, allowedRoles: FRONT_OFFICE },

  { from: JobStatus.APPROVED, to: JobStatus.WAITING_PARTS, allowedRoles: WORKSHOP },
  { from: JobStatus.APPROVED, to: JobStatus.IN_PROGRESS, allowedRoles: WORKSHOP },
  { from: JobStatus.APPROVED, to: JobStatus.ON_HOLD, allowedRoles: STAFF_ALL },

  { from: JobStatus.WAITING_PARTS, to: JobStatus.IN_PROGRESS, allowedRoles: WORKSHOP },
  { from: JobStatus.WAITING_PARTS, to: JobStatus.ON_HOLD, allowedRoles: STAFF_ALL },

  { from: JobStatus.IN_PROGRESS, to: JobStatus.QUALITY_CHECK, allowedRoles: WORKSHOP },
  { from: JobStatus.IN_PROGRESS, to: JobStatus.WAITING_PARTS, allowedRoles: WORKSHOP },
  // Additional work found mid-repair requires a new estimate version + approval
  // (DOMAIN.md §5) — it does not require leaving IN_PROGRESS, so there is no
  // IN_PROGRESS -> WAITING_APPROVAL transition; a new Estimate/Approval can be
  // created against the job without a status change.
  { from: JobStatus.IN_PROGRESS, to: JobStatus.ON_HOLD, allowedRoles: STAFF_ALL },

  { from: JobStatus.QUALITY_CHECK, to: JobStatus.READY, allowedRoles: WORKSHOP },
  { from: JobStatus.QUALITY_CHECK, to: JobStatus.IN_PROGRESS, allowedRoles: WORKSHOP },

  { from: JobStatus.READY, to: JobStatus.COLLECTED, allowedRoles: FRONT_OFFICE },

  { from: JobStatus.ON_HOLD, to: JobStatus.DIAGNOSING, allowedRoles: STAFF_ALL },
  { from: JobStatus.ON_HOLD, to: JobStatus.WAITING_APPROVAL, allowedRoles: STAFF_ALL },
  { from: JobStatus.ON_HOLD, to: JobStatus.APPROVED, allowedRoles: STAFF_ALL },
  { from: JobStatus.ON_HOLD, to: JobStatus.WAITING_PARTS, allowedRoles: STAFF_ALL },
  { from: JobStatus.ON_HOLD, to: JobStatus.IN_PROGRESS, allowedRoles: STAFF_ALL },
  { from: JobStatus.ON_HOLD, to: JobStatus.CANCELLED, allowedRoles: FRONT_OFFICE },

  { from: JobStatus.COLLECTED, to: JobStatus.CLOSED, allowedRoles: STAFF_ALL },
];

export function findTransition(from: JobStatus, to: JobStatus): JobTransition | undefined {
  return JOB_TRANSITIONS.find((t) => t.from === from && t.to === to);
}
