import { Controller, Get, Query } from "@nestjs/common";
import { Role } from "@le-garage/database";
import { reportRangeSchema, type ReportRangeInput } from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ReportsService } from "./reports.service";

/**
 * Spend reporting is for the people accountable for the spend
 * (docs/FLEET.md). The operational summary is also open to coordinators,
 * who already record and see every invoice through the invoice routes.
 * Mechanics get neither.
 */
@Controller("reports")
@Roles(Role.OWNER, Role.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("fleet-summary")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async fleetSummary(@CurrentUser() user: AccessTokenPayload) {
    return this.reportsService.fleetSummary(user.organizationId);
  }

  @Get("spend")
  async spend(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(reportRangeSchema)) range: ReportRangeInput,
  ) {
    return this.reportsService.spend(user.organizationId, range);
  }
}
