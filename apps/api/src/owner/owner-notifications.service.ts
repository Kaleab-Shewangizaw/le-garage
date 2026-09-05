import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";

@Injectable()
export class OwnerNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string) {
    return this.prisma.unscopedClient.notification.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async unreadCount(ownerId: string) {
    return this.prisma.unscopedClient.notification.count({ where: { userId: ownerId, readAt: null } });
  }

  async markRead(ownerId: string, notificationId: string) {
    const notification = await this.prisma.unscopedClient.notification.findFirst({
      where: { id: notificationId, userId: ownerId },
    });
    if (!notification) {
      throw AppError.notFound("NOTIFICATION_NOT_FOUND", "Notification not found");
    }
    return this.prisma.unscopedClient.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(ownerId: string) {
    await this.prisma.unscopedClient.notification.updateMany({
      where: { userId: ownerId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
