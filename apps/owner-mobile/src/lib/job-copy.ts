import type { OwnerJob } from "./api-types";

/**
 * The single place that turns garage-internal language into what a
 * vehicle owner actually reads (docs/OWNER-APP.md §"Plain language",
 * brief §4 — "WAITING_APPROVAL" must never appear on screen as itself).
 */

export type JobStatus = OwnerJob["status"];

const TERMINAL: JobStatus[] = ["COLLECTED", "CANCELLED", "CLOSED"];

export function isJobActive(status: JobStatus): boolean {
  return !TERMINAL.includes(status);
}

/**
 * The owner's own decision on the latest estimate can land before garage
 * staff transitions the job's own status forward (approving an estimate
 * and starting the repair are two separate, staff-controlled actions) —
 * without this, every screen would show a stale "your approval is
 * needed" the owner just acted on. Everywhere that displays job status to
 * an owner should resolve it through this first, not read `job.status`
 * directly.
 */
export function resolveDisplayStatus(job: Pick<OwnerJob, "status" | "estimates">): JobStatus {
  const latestEstimate = job.estimates[0];
  if (job.status === "WAITING_APPROVAL" && latestEstimate && latestEstimate.status === "APPROVED") {
    return "APPROVED";
  }
  return job.status;
}

export function statusHeadline(status: JobStatus): string {
  switch (status) {
    case "INTAKE":
      return "Checked in";
    case "DIAGNOSING":
      return "Being diagnosed";
    case "WAITING_APPROVAL":
      return "Your approval is needed";
    case "APPROVED":
      return "Approved — starting soon";
    case "WAITING_PARTS":
      return "Waiting on parts";
    case "IN_PROGRESS":
      return "Being repaired";
    case "QUALITY_CHECK":
      return "Final check";
    case "READY":
      return "Ready for pickup";
    case "ON_HOLD":
      return "On hold";
    case "CANCELLED":
      return "Cancelled";
    case "COLLECTED":
    case "CLOSED":
      return "Completed";
    default:
      return status;
  }
}

export function statusDescription(status: JobStatus): string {
  switch (status) {
    case "INTAKE":
      return "Your vehicle was checked in and is with the garage.";
    case "DIAGNOSING":
      return "The garage is figuring out what's wrong.";
    case "WAITING_APPROVAL":
      return "Review the estimate to let the garage continue.";
    case "APPROVED":
      return "The garage will begin work shortly.";
    case "WAITING_PARTS":
      return "The garage is waiting on a part before continuing.";
    case "IN_PROGRESS":
      return "Work is underway on your vehicle.";
    case "QUALITY_CHECK":
      return "The garage is doing a final check before handing it back.";
    case "READY":
      return "Your vehicle is ready to collect.";
    case "ON_HOLD":
      return "This job is temporarily paused.";
    case "CANCELLED":
      return "This job was cancelled.";
    case "COLLECTED":
    case "CLOSED":
      return "This job is complete and part of your service history.";
    default:
      return "";
  }
}

export type ProgressStageState = "done" | "current" | "upcoming";
export interface ProgressStage {
  key: string;
  label: string;
  state: ProgressStageState;
}

/**
 * A simple 6-stage timeline (brief §9): Received -> Diagnosing -> Waiting
 * for approval -> Repairing -> Quality check -> Ready. "Repairing" covers
 * APPROVED/WAITING_PARTS/IN_PROGRESS — from the owner's side these all
 * just mean "the garage is working on it," the distinction only matters
 * internally. A cancelled/on-hold job doesn't fit this line at all; the
 * caller should show statusHeadline instead.
 */
export function progressStages(job: Pick<OwnerJob, "status" | "diagnosingAt" | "waitingApprovalAt" | "approvedAt" | "inProgressAt" | "qualityCheckAt" | "readyAt">): ProgressStage[] {
  const order: { key: string; label: string; reachedBy: JobStatus[] }[] = [
    { key: "received", label: "Received", reachedBy: ["INTAKE", "DIAGNOSING", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_PROGRESS", "QUALITY_CHECK", "READY", "COLLECTED", "CLOSED"] },
    { key: "diagnosing", label: "Diagnosing", reachedBy: ["DIAGNOSING", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_PROGRESS", "QUALITY_CHECK", "READY", "COLLECTED", "CLOSED"] },
    { key: "approval", label: "Waiting for approval", reachedBy: ["WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_PROGRESS", "QUALITY_CHECK", "READY", "COLLECTED", "CLOSED"] },
    { key: "repairing", label: "Repairing", reachedBy: ["APPROVED", "WAITING_PARTS", "IN_PROGRESS", "QUALITY_CHECK", "READY", "COLLECTED", "CLOSED"] },
    { key: "quality_check", label: "Quality check", reachedBy: ["QUALITY_CHECK", "READY", "COLLECTED", "CLOSED"] },
    { key: "ready", label: "Ready", reachedBy: ["READY", "COLLECTED", "CLOSED"] },
  ];

  const currentIndex = order.reduce((acc, stage, i) => (stage.reachedBy.includes(job.status) ? i : acc), -1);

  return order.map((stage, i) => {
    let state: ProgressStageState = "upcoming";
    if (i < currentIndex) state = "done";
    else if (i === currentIndex) state = "current";
    return { key: stage.key, label: stage.label, state };
  });
}

export function approvalMethodLabel(method: string): string {
  switch (method) {
    case "IN_APP":
      return "Approved in the app";
    case "PHONE":
      return "Approved by phone call";
    case "VERBAL_LOGGED_BY_STAFF":
      return "Approved by phone, logged by the garage";
    default:
      return method;
  }
}
