import { Body, Controller, Get, Patch } from "@nestjs/common";
import { Role } from "@le-garage/database";
import { updateGarageSchema, type UpdateGarageInput } from "@le-garage/validation";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { AccessTokenPayload } from "@le-garage/types";
import { GaragesService } from "./garages.service";

@Controller("garages")
export class GaragesController {
  constructor(private readonly garagesService: GaragesService) {}

  @Get("me")
  async getCurrent(@CurrentUser() user: AccessTokenPayload) {
    return this.garagesService.getCurrent(user.organizationId, user.garageId);
  }

  @Patch("me")
  @Roles(Role.OWNER, Role.MANAGER)
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(updateGarageSchema)) body: UpdateGarageInput,
  ) {
    return this.garagesService.update(user.organizationId, user.garageId, user.sub, body);
  }
}
