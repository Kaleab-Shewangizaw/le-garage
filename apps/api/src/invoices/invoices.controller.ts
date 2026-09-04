import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Role } from "@le-garage/database";
import {
  generateInvoiceSchema,
  voidInvoiceSchema,
  type GenerateInvoiceInput,
  type VoidInvoiceInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InvoicesService } from "./invoices.service";

@Controller("jobs/:jobId/invoices")
@Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.invoicesService.list(user.organizationId, jobId);
  }

  @Get("latest")
  async latest(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.invoicesService.latest(user.organizationId, jobId);
  }

  @Post()
  async generateDraft(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Body(new ZodValidationPipe(generateInvoiceSchema)) body: GenerateInvoiceInput,
  ) {
    return this.invoicesService.generateDraft(user.organizationId, jobId, user.staffMemberId, user.sub, body);
  }

  @Post(":invoiceId/issue")
  async issue(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    return this.invoicesService.issue(user.organizationId, jobId, invoiceId, user.sub);
  }

  @Post(":invoiceId/void")
  @Roles(Role.OWNER, Role.MANAGER)
  async void(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Param("invoiceId") invoiceId: string,
    @Body(new ZodValidationPipe(voidInvoiceSchema)) body: VoidInvoiceInput,
  ) {
    return this.invoicesService.void(user.organizationId, jobId, invoiceId, user.sub, body.reason);
  }
}
