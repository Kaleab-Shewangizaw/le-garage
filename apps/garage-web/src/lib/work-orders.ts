import type { Job } from "@/lib/api-types";

/**
 * A fleet repair whose work is being done by a garage on Le Garage
 * (docs/WORK-ORDERS.md): the garage records the estimate, parts, labor,
 * invoice and progress; the fleet approves and watches. The API enforces
 * this (HANDLED_BY_GARAGE); the UI just doesn't offer what would be refused.
 */
export function garageHandles(job: Pick<Job, "workOrder">): boolean {
  return job.workOrder?.side === "FLEET" && (job.workOrder.status === "SENT" || job.workOrder.status === "ACCEPTED");
}

/** A garage job that came in as a fleet's work order — the fleet approves its estimates. */
export function isFleetWorkOrder(job: Pick<Job, "workOrder">): boolean {
  return job.workOrder?.side === "GARAGE" && job.workOrder.status === "ACCEPTED";
}
