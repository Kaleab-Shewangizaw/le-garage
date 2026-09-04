import { Controller, Get } from "@nestjs/common";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  async summary(@CurrentUser() user: AccessTokenPayload) {
    return this.dashboardService.summary(user.organizationId);
  }
}
