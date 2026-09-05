import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { Public } from "../common/decorators/public.decorator";
import { CurrentOwner } from "../common/decorators/current-owner.decorator";
import { OwnerJwtAuthGuard } from "../common/guards/owner-jwt-auth.guard";
import { OwnerNotificationsService } from "./owner-notifications.service";

@Public()
@UseGuards(OwnerJwtAuthGuard)
@Controller("owner/notifications")
export class OwnerNotificationsController {
  constructor(private readonly notifications: OwnerNotificationsService) {}

  @Get()
  async list(@CurrentOwner() owner: OwnerAccessTokenPayload) {
    const [items, unreadCount] = await Promise.all([
      this.notifications.list(owner.sub),
      this.notifications.unreadCount(owner.sub),
    ]);
    return { items, unreadCount };
  }

  @Post(":id/read")
  async markRead(@CurrentOwner() owner: OwnerAccessTokenPayload, @Param("id") id: string) {
    return this.notifications.markRead(owner.sub, id);
  }

  @Post("read-all")
  async markAllRead(@CurrentOwner() owner: OwnerAccessTokenPayload) {
    await this.notifications.markAllRead(owner.sub);
  }
}
