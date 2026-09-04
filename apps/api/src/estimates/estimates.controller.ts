import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Role } from "@le-garage/database";
import { createEstimateSchema, type CreateEstimateInput } from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EstimatesService } from "./estimates.service";

@Controller("jobs/:jobId/estimates")
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.estimatesService.list(user.organizationId, jobId);
  }

  @Get("latest")
  async latest(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.estimatesService.latest(user.organizationId, jobId);
  }

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async createOrReplaceDraft(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Body(new ZodValidationPipe(createEstimateSchema)) body: CreateEstimateInput,
  ) {
    return this.estimatesService.createOrReplaceDraft(user.organizationId, jobId, user.staffMemberId, user.sub, body);
  }

  @Post(":estimateId/send")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async send(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Param("estimateId") estimateId: string,
  ) {
    return this.estimatesService.send(user.organizationId, jobId, estimateId, user.sub);
  }
}
