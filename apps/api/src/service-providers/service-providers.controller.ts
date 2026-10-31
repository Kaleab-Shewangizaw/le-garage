import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@le-garage/database";
import {
  createServiceProviderSchema,
  updateServiceProviderSchema,
  type CreateServiceProviderInput,
  type UpdateServiceProviderInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ServiceProvidersService } from "./service-providers.service";

@Controller("service-providers")
export class ServiceProvidersController {
  constructor(private readonly serviceProvidersService: ServiceProvidersService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Query("includeInactive") includeInactive?: string) {
    return this.serviceProvidersService.list(user.organizationId, includeInactive === "true");
  }

  @Get("directory")
  async directory(@CurrentUser() user: AccessTokenPayload, @Query("search") search?: string) {
    return this.serviceProvidersService.directory(user.organizationId, search);
  }

  @Get(":id")
  async getById(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.serviceProvidersService.getById(user.organizationId, id);
  }

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(createServiceProviderSchema)) body: CreateServiceProviderInput,
  ) {
    return this.serviceProvidersService.create(user.organizationId, user.sub, body);
  }

  @Patch(":id")
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateServiceProviderSchema)) body: UpdateServiceProviderInput,
  ) {
    return this.serviceProvidersService.update(user.organizationId, id, user.sub, body);
  }
}
