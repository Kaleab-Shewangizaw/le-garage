import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { registerOrganizationSchema, type RegisterOrganizationInput } from "@le-garage/validation";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Public } from "../common/decorators/public.decorator";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(new ZodValidationPipe(registerOrganizationSchema)) body: RegisterOrganizationInput) {
    const { tokens, ctx, organization, garage } = await this.organizationsService.register(body);
    return { ...tokens, context: ctx, organization, garage };
  }
}
