import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Role, VehicleStatus } from "@le-garage/database";
import {
  createVehicleSchema,
  updateVehicleSchema,
  type CreateVehicleInput,
  type UpdateVehicleInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { VehiclesService } from "./vehicles.service";

@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async search(
    @CurrentUser() user: AccessTokenPayload,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    const statusFilter = status && status in VehicleStatus ? (status as VehicleStatus) : undefined;
    return this.vehiclesService.search(user.organizationId, search, statusFilter, limit ? Number(limit) : undefined);
  }

  @Get(":id")
  async getById(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.vehiclesService.getById(user.organizationId, id);
  }

  @Get(":id/jobs")
  async jobHistory(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.vehiclesService.jobHistory(user.organizationId, id);
  }

  @Get(":id/visits")
  async visits(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.vehiclesService.visits(user.organizationId, id);
  }

  @Get(":id/service-history")
  async serviceHistory(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.vehiclesService.serviceHistory(user.organizationId, id);
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(createVehicleSchema)) body: CreateVehicleInput,
  ) {
    return this.vehiclesService.create(user.organizationId, user.sub, body);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: UpdateVehicleInput,
  ) {
    return this.vehiclesService.update(user.organizationId, id, user.sub, user.role as Role, body);
  }
}
