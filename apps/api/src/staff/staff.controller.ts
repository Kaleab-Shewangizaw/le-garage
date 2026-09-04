import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@le-garage/database";
import {
  inviteStaffSchema,
  updateStaffSchema,
  type InviteStaffInput as ValidatedInviteInput,
  type UpdateStaffInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StaffService } from "./staff.service";

@Controller("staff")
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return this.staffService.list(user.organizationId, user.garageId);
  }

  @Post("invite")
  @Roles(Role.OWNER, Role.MANAGER)
  async invite(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(inviteStaffSchema)) body: ValidatedInviteInput,
  ) {
    return this.staffService.invite(user.organizationId, user.garageId, user.sub, body as never);
  }

  @Patch(":staffId")
  @Roles(Role.OWNER, Role.MANAGER)
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("staffId") staffId: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
  ) {
    return this.staffService.updateRole(user.organizationId, user.garageId, staffId, user.sub, body as never);
  }
}
