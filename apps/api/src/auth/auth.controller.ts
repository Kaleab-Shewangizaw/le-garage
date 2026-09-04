import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { loginSchema, refreshSchema, type LoginInput, type RefreshInput } from "@le-garage/validation";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AccessTokenPayload } from "@le-garage/types";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    const { tokens, ctx } = await this.authService.login(body);
    return { ...tokens, context: ctx };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    const { tokens, ctx } = await this.authService.refresh(body.refreshToken);
    return { ...tokens, context: ctx };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    await this.authService.logout(body.refreshToken);
  }

  @Get("me")
  async me(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.me(user.sub, user.organizationId);
  }
}
