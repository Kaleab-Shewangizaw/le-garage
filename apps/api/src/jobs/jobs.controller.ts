import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { JobStatus, Role } from "@le-garage/database";
import {
  assignTechnicianSchema,
  createJobSchema,
  updateJobStatusSchema,
  type AssignTechnicianInput,
  type CreateJobInput,
  type UpdateJobStatusInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { Roles } from "../common/decorators/roles.decorator";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { JobsService } from "./jobs.service";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query("status") status?: JobStatus,
    @Query("search") search?: string,
    @Query("assignedTechnicianId") assignedTechnicianId?: string,
    @Query("mine") mine?: string,
  ) {
    // "mine" is the technician job list (brief: technician job list) —
    // resolved from the caller's own staffMemberId, not a client-supplied id.
    const technicianFilter = mine === "true" ? user.staffMemberId : assignedTechnicianId;
    return this.jobsService.list(user.organizationId, status, search, technicianFilter);
  }

  @Get(":id")
  async getById(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.jobsService.getById(user.organizationId, id);
  }

  @Get(":id/events")
  async events(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.jobsService.events(user.organizationId, id);
  }

  @Post()
  @Idempotent()
  async createIntake(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobInput,
  ) {
    return this.jobsService.createIntake(user.organizationId, user.garageId, user.sub, body);
  }

  @Patch(":id/status")
  @Idempotent()
  async transitionStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateJobStatusSchema)) body: UpdateJobStatusInput,
  ) {
    return this.jobsService.transitionStatus(
      user.organizationId,
      id,
      user.sub,
      user.role as never,
      body.toStatus as JobStatus,
      body.note,
    );
  }

  @Patch(":id/assign")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async assign(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignTechnicianSchema)) body: AssignTechnicianInput,
  ) {
    return this.jobsService.assignTechnician(user.organizationId, user.garageId, id, user.sub, body);
  }
}
