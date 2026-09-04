import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async search(@CurrentUser() user: AccessTokenPayload, @Query("search") search?: string) {
    return this.customersService.search(user.organizationId, search);
  }

  @Get(":id")
  async getById(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.customersService.getById(user.organizationId, id);
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
  ) {
    return this.customersService.create(user.organizationId, user.sub, body);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
  ) {
    return this.customersService.update(user.organizationId, id, user.sub, body);
  }
}
