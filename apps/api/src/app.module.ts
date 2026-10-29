import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";

import { PrismaModule } from "./common/prisma/prisma.module";
import { StorageModule } from "./common/storage/storage.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { GaragesModule } from "./garages/garages.module";
import { StaffModule } from "./staff/staff.module";
import { CustomersModule } from "./customers/customers.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { JobsModule } from "./jobs/jobs.module";
import { DiagnosesModule } from "./diagnoses/diagnoses.module";
import { NotesModule } from "./notes/notes.module";
import { EstimatesModule } from "./estimates/estimates.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { PartsModule } from "./parts/parts.module";
import { LaborModule } from "./labor/labor.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PaymentsModule } from "./payments/payments.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FilesModule } from "./files/files.module";
import { OwnerModule } from "./owner/owner.module";
import { ServiceProvidersModule } from "./service-providers/service-providers.module";
import { ReportsModule } from "./reports/reports.module";
import { AdminModule } from "./admin/admin.module";
import { DomainEventsModule } from "./common/events/domain-events";
import { WorkOrdersModule } from "./work-orders/work-orders.module";
import { StaffNotificationsModule } from "./notifications/staff-notifications.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Generous global default (docs/SECURITY.md §10); auth endpoints apply
    // a stricter per-route @Throttle on top of this.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
    DomainEventsModule,
    StorageModule,
    RealtimeModule,
    NotificationsModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    GaragesModule,
    StaffModule,
    CustomersModule,
    VehiclesModule,
    JobsModule,
    DiagnosesModule,
    NotesModule,
    EstimatesModule,
    ApprovalsModule,
    PartsModule,
    LaborModule,
    InvoicesModule,
    PaymentsModule,
    DashboardModule,
    FilesModule,
    OwnerModule,
    ServiceProvidersModule,
    ReportsModule,
    AdminModule,
    StaffNotificationsModule,
    WorkOrdersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
