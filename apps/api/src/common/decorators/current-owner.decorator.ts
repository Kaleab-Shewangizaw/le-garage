import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { OwnerAccessTokenPayload } from "@le-garage/types";

/** Extracts the authenticated owner-mobile request's decoded token payload. */
export const CurrentOwner = createParamDecorator((_data: unknown, ctx: ExecutionContext): OwnerAccessTokenPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.owner;
});
