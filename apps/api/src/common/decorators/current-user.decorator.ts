import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AccessTokenPayload } from "@le-garage/types";

/** Extracts the authenticated request's decoded access-token payload. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
