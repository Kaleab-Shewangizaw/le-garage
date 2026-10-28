import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ownerEstimateDecisionSchema, type OwnerEstimateDecisionInput } from "@le-garage/validation";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Public } from "../common/decorators/public.decorator";
import { CurrentOwner } from "../common/decorators/current-owner.decorator";
import { OwnerJwtAuthGuard } from "../common/guards/owner-jwt-auth.guard";
import { OwnerEstimatesService } from "./owner-estimates.service";

@Public()
@UseGuards(OwnerJwtAuthGuard)
@Controller("owner/estimates")
export class OwnerEstimatesController {
  constructor(private readonly estimates: OwnerEstimatesService) {}

  @Post(":id/decide")
  async decide(
    @CurrentOwner() owner: OwnerAccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ownerEstimateDecisionSchema)) body: OwnerEstimateDecisionInput,
  ) {
    return this.estimates.decide(owner.sub, id, body);
  }
}
