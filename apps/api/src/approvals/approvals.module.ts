import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";

@Module({
  imports: [JobsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
