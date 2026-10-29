import { Injectable, Logger } from "@nestjs/common";
import { NotificationChannel, NotificationStatus, Role } from "@le-garage/database";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";

export interface StaffNotice {
  type: string;
  title: string;
  body: string;
  /** Where in the web app this notice should open. */
  href?: string;
}

/**
 * Notifications for staff (docs/WORK-ORDERS.md): an in-app notice (the
 * bell in garage-web) plus an SMS and an email to each recipient who has a
 * phone/email on file.
 *
 * Delivery honesty: no SMS gateway or email service is configured in this
 * project, so SMS/EMAIL go through a development "log" adapter — the
 * message is written to the API log and the row is marked SENT with
 * `payload.deliveredVia = "dev-log"`. Plugging in a real provider (an
 * Ethiopian SMS gateway, an SMTP/transactional email service) means
 * replacing `deliver()`; nothing else changes.
 */
@Injectable()
export class StaffNotificationsService {
  private readonly logger = new Logger("Notify");

  constructor(private readonly prisma: PrismaService) {}

  /** Notify the active staff of an organization, optionally only some roles. */
  async notifyOrganization(organizationId: string, roles: Role[] | null, notice: StaffNotice): Promise<void> {
    // Recipient lookup for another tenant (the other side of a work order) —
    // resolved by the caller's verified link, not an attacker-chosen id.
    const staff = await this.prisma.unscopedClient.staffMember.findMany({
      where: { organizationId, active: true, ...(roles ? { role: { in: roles } } : {}) },
      include: { user: { select: { id: true, email: true, phone: true } } },
    });
    for (const member of staff) {
      const payload = { href: notice.href ?? null, organizationId };
      await this.prisma.unscopedClient.notification.create({
        data: { userId: member.user.id, channel: NotificationChannel.IN_APP, type: notice.type, title: notice.title, body: notice.body, payload, status: NotificationStatus.SENT, sentAt: new Date() },
      });
      if (member.user.phone) {
        await this.deliver(member.user.id, NotificationChannel.SMS, member.user.phone, notice, payload);
      }
      if (member.user.email) {
        await this.deliver(member.user.id, NotificationChannel.EMAIL, member.user.email, notice, payload);
      }
    }
  }

  private async deliver(userId: string, channel: NotificationChannel, to: string, notice: StaffNotice, payload: Record<string, unknown>) {
    const text = `${notice.title} — ${notice.body}`;
    this.logger.log(`[${channel} → ${to}] ${text}`);
    await this.prisma.unscopedClient.notification.create({
      data: {
        userId,
        channel,
        type: notice.type,
        title: notice.title,
        body: notice.body,
        payload: { ...payload, to, deliveredVia: "dev-log" },
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.unscopedClient.notification.findMany({
      where: { userId, channel: NotificationChannel.IN_APP },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.unscopedClient.notification.findFirst({ where: { id, userId } });
    if (!n) throw AppError.notFound("NOTIFICATION_NOT_FOUND", "Notification not found");
    return this.prisma.unscopedClient.notification.update({ where: { id }, data: { readAt: n.readAt ?? new Date() } });
  }

  async markAllRead(userId: string) {
    await this.prisma.unscopedClient.notification.updateMany({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
