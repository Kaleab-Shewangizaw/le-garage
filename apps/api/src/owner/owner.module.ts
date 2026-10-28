import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { OwnerAuthController } from "./owner-auth.controller";
import { OwnerAuthService } from "./owner-auth.service";
import { OwnerAccessService } from "./owner-access.service";
import { OwnerCustomerMatchesController, OwnerCustomerLinksController } from "./owner-customers.controller";
import { OwnerCustomersService } from "./owner-customers.service";
import { OwnerVehiclesController } from "./owner-vehicles.controller";
import { OwnerVehiclesService } from "./owner-vehicles.service";
import { OwnerJobsController } from "./owner-jobs.controller";
import { OwnerJobsService } from "./owner-jobs.service";
import { OwnerEstimatesController } from "./owner-estimates.controller";
import { OwnerEstimatesService } from "./owner-estimates.service";
import { OwnerAttachmentsController } from "./owner-attachments.controller";
import { OwnerAttachmentsService } from "./owner-attachments.service";
import { OwnerNotificationsController } from "./owner-notifications.controller";
import { OwnerNotificationsService } from "./owner-notifications.service";

/**
 * The entire owner-mobile-facing API surface (docs/OWNER-APP.md). Kept as
 * one module, separate from every staff-facing module, so "everything a
 * vehicle owner can reach" is one place to review — matching how
 * SECURITY.md treats tenant isolation as the #1 risk to audit.
 */
@Module({
  imports: [AuthModule, ApprovalsModule],
  controllers: [
    OwnerAuthController,
    OwnerCustomerMatchesController,
    OwnerCustomerLinksController,
    OwnerVehiclesController,
    OwnerJobsController,
    OwnerEstimatesController,
    OwnerAttachmentsController,
    OwnerNotificationsController,
  ],
  providers: [
    OwnerAuthService,
    OwnerAccessService,
    OwnerCustomersService,
    OwnerVehiclesService,
    OwnerJobsService,
    OwnerEstimatesService,
    OwnerAttachmentsService,
    OwnerNotificationsService,
  ],
})
export class OwnerModule {}
