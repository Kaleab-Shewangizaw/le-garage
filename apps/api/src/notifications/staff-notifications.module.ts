import { Global, Module } from "@nestjs/common";
import { StaffNotificationsController } from "./staff-notifications.controller";
import { StaffNotificationsService } from "./staff-notifications.service";

@Global()
@Module({
  controllers: [StaffNotificationsController],
  providers: [StaffNotificationsService],
  exports: [StaffNotificationsService],
})
export class StaffNotificationsModule {}
