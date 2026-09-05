import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { loginSchema, ownerRegisterSchema, refreshSchema, type LoginInput, type OwnerRegisterInput, type RefreshInput } from "@le-garage/validation";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Public } from "../common/decorators/public.decorator";
import { CurrentOwner } from "../common/decorators/current-owner.decorator";
import { OwnerJwtAuthGuard } from "../common/guards/owner-jwt-auth.guard";
import { OwnerAuthService } from "./owner-auth.service";

/**
 * Owner-mobile's own auth surface — entirely separate from `/auth` (staff).
 * Every route here is `@Public()` (skips the global staff JwtAuthGuard) and
 * the protected ones apply `OwnerJwtAuthGuard` explicitly instead
 * (docs/DECISIONS.md ADR-0020).
 */
@Controller("owner/auth")
export class OwnerAuthController {
  constructor(private readonly ownerAuth: OwnerAuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(new ZodValidationPipe(ownerRegisterSchema)) body: OwnerRegisterInput) {
    const { tokens, userId } = await this.ownerAuth.register(body);
    return { ...tokens, userId };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    const { tokens, userId } = await this.ownerAuth.login(body.identifier, body.password);
    return { ...tokens, userId };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    const { tokens, ctx } = await this.ownerAuth.refresh(body.refreshToken);
    return { ...tokens, userId: ctx.userId };
  }

  @Public()
  @UseGuards(OwnerJwtAuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    await this.ownerAuth.logout(body.refreshToken);
  }

  @Public()
  @UseGuards(OwnerJwtAuthGuard)
  @Get("me")
  async me(@CurrentOwner() owner: OwnerAccessTokenPayload) {
    return this.ownerAuth.me(owner.sub);
  }
}
