import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { Public } from "../common/decorators/public.decorator";
import { CurrentOwner } from "../common/decorators/current-owner.decorator";
import { OwnerJwtAuthGuard } from "../common/guards/owner-jwt-auth.guard";
import { OwnerVehiclesService } from "./owner-vehicles.service";

@Public()
@UseGuards(OwnerJwtAuthGuard)
@Controller("owner/vehicles")
export class OwnerVehiclesController {
  constructor(private readonly vehicles: OwnerVehiclesService) {}

  @Get()
  async list(@CurrentOwner() owner: OwnerAccessTokenPayload) {
    return this.vehicles.list(owner.sub);
  }

  @Get(":id")
  async getById(@CurrentOwner() owner: OwnerAccessTokenPayload, @Param("id") id: string) {
    return this.vehicles.getById(owner.sub, id);
  }
}
