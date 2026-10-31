import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrderSyncService } from "./work-order-sync.service";

@Module({
  imports: [JobsModule, ApprovalsModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderSyncService],
})
export class WorkOrdersModule {}
