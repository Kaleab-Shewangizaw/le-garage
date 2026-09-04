import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@le-garage/database";
import {
  createJobLaborSchema,
  updateJobLaborSchema,
  type CreateJobLaborInput,
  type UpdateJobLaborInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { LaborService } from "./labor.service";

@Controller()
export class LaborController {
  constructor(private readonly laborService: LaborService) {}

  @Get("jobs/:jobId/labor")
  async list(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.laborService.list(user.organizationId, jobId);
  }

  @Post("jobs/:jobId/labor")
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Body(new ZodValidationPipe(createJobLaborSchema)) body: CreateJobLaborInput,
  ) {
    return this.laborService.create(user.organizationId, jobId, user.sub, body);
  }

  @Patch("jobs/:jobId/labor/:laborId")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Param("laborId") laborId: string,
    @Body(new ZodValidationPipe(updateJobLaborSchema)) body: UpdateJobLaborInput,
  ) {
    return this.laborService.update(user.organizationId, jobId, laborId, user.sub, body);
  }

  @Delete("jobs/:jobId/labor/:laborId")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Param("laborId") laborId: string,
  ) {
    await this.laborService.remove(user.organizationId, jobId, laborId, user.sub);
    return { success: true };
  }
}
