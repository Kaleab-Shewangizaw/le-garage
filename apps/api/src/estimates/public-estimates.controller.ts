import { Controller, Get, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { EstimatesService } from "./estimates.service";

/**
 * Unauthenticated, deliberately separate from EstimatesController — a
 * customer viewing a shared estimate has no login, no tenant context, and
 * this route must never be reachable via any org-scoped path. See
 * EstimatesService.getByShareToken for the security reasoning.
 */
@Controller("public/estimates")
export class PublicEstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(":token")
  async getByToken(@Param("token") token: string) {
    return this.estimatesService.getByShareToken(token);
  }
}
