import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { confirmCustomerLinkSchema, type ConfirmCustomerLinkInput } from "@le-garage/validation";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Public } from "../common/decorators/public.decorator";
import { CurrentOwner } from "../common/decorators/current-owner.decorator";
import { OwnerJwtAuthGuard } from "../common/guards/owner-jwt-auth.guard";
import { OwnerCustomersService } from "./owner-customers.service";

@Public()
@UseGuards(OwnerJwtAuthGuard)
@Controller("owner/customer-matches")
export class OwnerCustomerMatchesController {
  constructor(private readonly service: OwnerCustomersService) {}

  @Get()
  async matches(@CurrentOwner() owner: OwnerAccessTokenPayload) {
    return this.service.matches(owner.sub);
  }
}

@Public()
@UseGuards(OwnerJwtAuthGuard)
@Controller("owner/customer-links")
export class OwnerCustomerLinksController {
  constructor(private readonly service: OwnerCustomersService) {}

  @Get()
  async myLinks(@CurrentOwner() owner: OwnerAccessTokenPayload) {
    return this.service.myLinks(owner.sub);
  }

  @Post()
  async confirm(
    @CurrentOwner() owner: OwnerAccessTokenPayload,
    @Body(new ZodValidationPipe(confirmCustomerLinkSchema)) body: ConfirmCustomerLinkInput,
  ) {
    return this.service.confirm(owner.sub, body.customerId);
  }
}
