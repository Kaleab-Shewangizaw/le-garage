import { Controller, Get, Param, Post } from "@nestjs/common";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StaffNotificationsService } from "./staff-notifications.service";

/** The signed-in staff member's own in-app notifications (the bell). */
@Controller("notifications")
export class StaffNotificationsController {
  constructor(private readonly notifications: StaffNotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.listForUser(user.sub);
  }

  @Post("read-all")
  async readAll(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Post(":id/read")
  async read(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.notifications.markRead(user.sub, id);
  }
}
