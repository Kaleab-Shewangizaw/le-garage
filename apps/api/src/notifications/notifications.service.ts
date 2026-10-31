import { Injectable } from "@nestjs/common";
import { NotificationChannel, NotificationStatus } from "@le-garage/database";
import { PrismaService } from "../common/prisma/prisma.service";

interface JobAuditContext {
  organizationId: string;
  jobId: string;
  action: string;
  afterState?: unknown;
}

/**
 * Foundation only (docs/OWNER-APP.md §"Notifications", brief §14: "do not
 * build an entire notification platform if the backend isn't ready").
 * Every row is written as IN_APP/SENT — there is no device-token
 * registration and nothing here calls a real push service (Expo's or
 * otherwise). The owner app polls `GET /owner/notifications`. Real push
 * delivery is deferred; see docs/OPEN_QUESTIONS.md.
 *
 * Piggybacks on AuditService.record the same way realtime does
 * (docs/DECISIONS.md ADR-0016) — one call site per meaningful mutation,
 * not a notification call scattered into every service.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyForJobEvent(ctx: JobAuditContext): Promise<void> {
    const copy = this.copyFor(ctx.action, ctx.afterState);
    if (!copy) return;

    const job = await this.prisma.client.job.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId },
      select: { customerId: true, vehicle: { select: { make: true, model: true } } },
    });
    // Fleet repairs have no Customer (docs/FLEET.md) — nobody in the owner app to notify.
    if (!job?.customerId) return;

    const links = await this.prisma.unscopedClient.customerLink.findMany({
      where: { customerId: job.customerId },
      select: { userId: true },
    });
    if (links.length === 0) return;

    const vehicleLabel = `${job.vehicle.make} ${job.vehicle.model}`;
    await this.prisma.unscopedClient.notification.createMany({
      data: links.map((l) => ({
        userId: l.userId,
        channel: NotificationChannel.IN_APP,
        type: ctx.action,
        title: copy.title,
        body: copy.body.replace("{vehicle}", vehicleLabel),
        payload: { jobId: ctx.jobId },
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      })),
    });
  }

  private copyFor(action: string, afterState: unknown): { title: string; body: string } | null {
    switch (action) {
      case "JOB_CREATED_INTAKE":
        return { title: "Vehicle checked in", body: "{vehicle} was checked in and is now with the garage." };
      case "DIAGNOSIS_ADDED":
        return { title: "Diagnosis ready", body: "The garage found what's wrong with {vehicle}." };
      case "ESTIMATE_SENT":
        return { title: "Your approval is needed", body: "An estimate for {vehicle} is ready for your review." };
      case "PAYMENT_RECORDED":
        return { title: "Payment received", body: "A payment was recorded for {vehicle}." };
      case "JOB_STATUS_CHANGED": {
        const status = (afterState as { status?: string } | undefined)?.status;
        if (status === "IN_PROGRESS") return { title: "Repair started", body: "Work has started on {vehicle}." };
        if (status === "READY") return { title: "Ready for pickup", body: "{vehicle} is ready for pickup." };
        return null;
      }
      default:
        return null;
    }
  }
}
