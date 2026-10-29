import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Role } from "@le-garage/database";
import { createApprovalSchema, type CreateApprovalInput } from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ApprovalsService } from "./approvals.service";

@Controller()
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get("jobs/:jobId/approvals")
  async listForJob(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.approvalsService.listForJob(user.organizationId, jobId);
  }

  // Technicians never record spend decisions (docs/AUTH.md §3). Fleet orgs
  // narrow this further to OWNER/MANAGER inside ApprovalsService.
  @Post("estimates/:estimateId/approvals")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Idempotent()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Param("estimateId") estimateId: string,
    @Body(new ZodValidationPipe(createApprovalSchema)) body: CreateApprovalInput,
  ) {
    return this.approvalsService.create(
      user.organizationId,
      estimateId,
      user.staffMemberId,
      user.sub,
      body,
      undefined,
      user.role as Role,
    );
  }
}
