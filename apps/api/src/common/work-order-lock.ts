import { WorkOrderStatus } from "@le-garage/database";
import type { PrismaService } from "./prisma/prisma.service";
import { AppError } from "./errors/app-error";

const ACTIVE = [WorkOrderStatus.SENT, WorkOrderStatus.ACCEPTED];

/** The active work order (sent or accepted) for a fleet repair, if any (docs/WORK-ORDERS.md). */
export async function activeWorkOrderForFleetJob(prisma: PrismaService, organizationId: string, jobId: string) {
  return prisma.client.workOrder.findFirst({
    where: { fleetOrganizationId: organizationId, fleetJobId: jobId, status: { in: ACTIVE } },
  });
}

/** The accepted work order behind a garage's job, if the job came from a fleet. */
export async function workOrderForGarageJob(prisma: PrismaService, organizationId: string, jobId: string) {
  return prisma.client.workOrder.findFirst({
    where: { garageOrganizationId: organizationId, garageJobId: jobId, status: WorkOrderStatus.ACCEPTED },
  });
}

/**
 * Once a fleet sends a repair to a garage on Le Garage, the garage does the
 * work in its own account: the fleet's copy of the estimate, parts/labor and
 * invoice comes from the garage, so the fleet can't edit them directly.
 * (Offline providers — no garage account — are unaffected.)
 */
export async function assertNotGarageHandled(prisma: PrismaService, organizationId: string, jobId: string) {
  const workOrder = await activeWorkOrderForFleetJob(prisma, organizationId, jobId);
  if (workOrder) {
    throw AppError.conflict(
      "HANDLED_BY_GARAGE",
      "This repair has been sent to a garage on Le Garage — they record the estimate, work and invoice, and you approve it",
      { workOrderId: workOrder.id },
    );
  }
}
