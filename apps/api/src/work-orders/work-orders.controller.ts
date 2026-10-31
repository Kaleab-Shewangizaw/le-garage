import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Role, WorkOrderStatus } from "@le-garage/database";
import {
  declineWorkOrderSchema,
  sendWorkOrderSchema,
  type DeclineWorkOrderInput,
  type SendWorkOrderInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WorkOrdersService } from "./work-orders.service";

/** docs/WORK-ORDERS.md — fleet sends, garage accepts/declines, each side sees only its own job. */
@Controller()
@Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Post("jobs/:jobId/work-order")
  @Idempotent()
  async send(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Body(new ZodValidationPipe(sendWorkOrderSchema)) body: SendWorkOrderInput,
  ) {
    return this.workOrders.send(user.organizationId, jobId, user.sub, body);
  }

  @Get("work-orders")
  async list(@CurrentUser() user: AccessTokenPayload, @Query("status") status?: string) {
    const filter = status && status in WorkOrderStatus ? (status as WorkOrderStatus) : undefined;
    return this.workOrders.list(user.organizationId, filter);
  }

  @Post("work-orders/:id/accept")
  @Idempotent()
  async accept(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.workOrders.accept(user.organizationId, user.garageId, id, user.sub);
  }

  @Post("work-orders/:id/decline")
  async decline(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(declineWorkOrderSchema)) body: DeclineWorkOrderInput,
  ) {
    return this.workOrders.decline(user.organizationId, id, user.sub, body);
  }

  @Post("work-orders/:id/cancel")
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.workOrders.cancel(user.organizationId, id, user.sub);
  }
}
