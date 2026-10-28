import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { Public } from "../common/decorators/public.decorator";
import { CurrentOwner } from "../common/decorators/current-owner.decorator";
import { OwnerJwtAuthGuard } from "../common/guards/owner-jwt-auth.guard";
import { OwnerJobsService } from "./owner-jobs.service";

@Public()
@UseGuards(OwnerJwtAuthGuard)
@Controller("owner/jobs")
export class OwnerJobsController {
  constructor(private readonly jobs: OwnerJobsService) {}

  @Get(":id")
  async getById(@CurrentOwner() owner: OwnerAccessTokenPayload, @Param("id") id: string) {
    return this.jobs.getById(owner.sub, id);
  }
}
