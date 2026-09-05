import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  presignUploadSchema,
  registerAttachmentSchema,
  attachmentEntityTypeSchema,
  type PresignUploadInput,
  type RegisterAttachmentInput,
} from "@le-garage/validation";
import type { AttachmentEntityType } from "@le-garage/database";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppError } from "../common/errors/app-error";
import { FilesService } from "./files.service";

@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
  ) {
    const parsedType = attachmentEntityTypeSchema.safeParse(entityType);
    if (!parsedType.success || !entityId) {
      throw AppError.badRequest("INVALID_QUERY", "entityType and entityId query params are required");
    }
    return this.filesService.list(user.organizationId, parsedType.data as AttachmentEntityType, entityId);
  }

  // Rate-limited: presigned URL issuance is an abuse-prone surface (docs/SECURITY.md §10).
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("presign")
  async presign(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(presignUploadSchema)) body: PresignUploadInput,
  ) {
    return this.filesService.presignUpload(user.organizationId, user.sub, body);
  }

  @Post()
  async register(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(registerAttachmentSchema)) body: RegisterAttachmentInput,
  ) {
    return this.filesService.register(user.organizationId, user.sub, body);
  }

  @Get(":id/url")
  async getUrl(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.filesService.getSignedUrl(user.organizationId, id);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    await this.filesService.remove(user.organizationId, id, user.sub);
    return { success: true };
  }
}
