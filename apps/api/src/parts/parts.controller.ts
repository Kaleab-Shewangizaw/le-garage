import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@le-garage/database";
import {
  createJobPartSchema,
  updateJobPartSchema,
  type CreateJobPartInput,
  type UpdateJobPartInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PartsService } from "./parts.service";

@Controller()
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Get("jobs/:jobId/parts")
  async list(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.partsService.list(user.organizationId, jobId);
  }

  @Post("jobs/:jobId/parts")
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Body(new ZodValidationPipe(createJobPartSchema)) body: CreateJobPartInput,
  ) {
    return this.partsService.create(user.organizationId, jobId, user.sub, body);
  }

  @Patch("jobs/:jobId/parts/:partId")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Param("partId") partId: string,
    @Body(new ZodValidationPipe(updateJobPartSchema)) body: UpdateJobPartInput,
  ) {
    return this.partsService.update(user.organizationId, jobId, partId, user.sub, body);
  }

  @Delete("jobs/:jobId/parts/:partId")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Param("partId") partId: string,
  ) {
    await this.partsService.remove(user.organizationId, jobId, partId, user.sub);
    return { success: true };
  }
}
