import { Module } from "@nestjs/common";
import { EstimatesController } from "./estimates.controller";
import { PublicEstimatesController } from "./public-estimates.controller";
import { EstimatesService } from "./estimates.service";

@Module({
  controllers: [EstimatesController, PublicEstimatesController],
  providers: [EstimatesService],
  exports: [EstimatesService],
})
export class EstimatesModule {}
