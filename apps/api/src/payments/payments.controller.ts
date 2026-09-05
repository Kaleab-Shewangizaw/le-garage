import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Role } from "@le-garage/database";
import {
  recordPaymentSchema,
  voidPaymentSchema,
  type RecordPaymentInput,
  type VoidPaymentInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { Roles } from "../common/decorators/roles.decorator";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PaymentsService } from "./payments.service";

@Controller("invoices/:invoiceId/payments")
@Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Param("invoiceId") invoiceId: string) {
    return this.paymentsService.list(user.organizationId, invoiceId);
  }

  @Get("balance")
  async balance(@CurrentUser() user: AccessTokenPayload, @Param("invoiceId") invoiceId: string) {
    return this.paymentsService.balance(user.organizationId, invoiceId);
  }

  @Post()
  @Idempotent()
  async record(
    @CurrentUser() user: AccessTokenPayload,
    @Param("invoiceId") invoiceId: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
  ) {
    return this.paymentsService.record(user.organizationId, invoiceId, user.staffMemberId, user.sub, body);
  }

  @Post(":paymentId/void")
  @Roles(Role.OWNER, Role.MANAGER)
  async void(
    @CurrentUser() user: AccessTokenPayload,
    @Param("invoiceId") invoiceId: string,
    @Param("paymentId") paymentId: string,
    @Body(new ZodValidationPipe(voidPaymentSchema)) body: VoidPaymentInput,
  ) {
    return this.paymentsService.void(user.organizationId, invoiceId, paymentId, user.sub, body.reason);
  }
}
