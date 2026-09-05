import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { Public } from "../common/decorators/public.decorator";
import { CurrentOwner } from "../common/decorators/current-owner.decorator";
import { OwnerJwtAuthGuard } from "../common/guards/owner-jwt-auth.guard";
import { OwnerAttachmentsService } from "./owner-attachments.service";

@Public()
@UseGuards(OwnerJwtAuthGuard)
@Controller("owner/attachments")
export class OwnerAttachmentsController {
  constructor(private readonly attachments: OwnerAttachmentsService) {}

  @Get(":id/url")
  async getSignedUrl(@CurrentOwner() owner: OwnerAccessTokenPayload, @Param("id") id: string) {
    return this.attachments.getSignedUrl(owner.sub, id);
  }
}
