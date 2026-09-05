import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AttachmentEntityType } from "@le-garage/database";
import { maxBytesFor, type PresignUploadInput, type RegisterAttachmentInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

/**
 * Attachments (docs/DOMAIN.md §3, docs/SECURITY.md §7): photos/documents
 * evidencing intake condition, damage, diagnosis, and completed work. The
 * API only ever issues short-lived presigned URLs — it never proxies file
 * bytes, and nothing is ever served from a public bucket/URL.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async presignUpload(organizationId: string, actorUserId: string, input: PresignUploadInput) {
    await this.assertEntityBelongsToOrg(organizationId, input.entityType, input.entityId);

    const extension = EXTENSION_BY_MIME[input.mimeType] ?? "bin";
    const objectKey = `${organizationId}/${input.entityType.toLowerCase()}/${input.entityId}/${randomUUID()}.${extension}`;

    const uploadUrl = await this.storage.presignUpload(objectKey, input.mimeType);

    return { uploadUrl, objectKey, expiresIn: 300 };
  }

  async register(organizationId: string, actorUserId: string, input: RegisterAttachmentInput) {
    if (!input.objectKey.startsWith(`${organizationId}/`)) {
      throw AppError.forbidden("INVALID_OBJECT_KEY", "This upload key does not belong to your organization");
    }
    await this.assertEntityBelongsToOrg(organizationId, input.entityType, input.entityId);

    const head = await this.storage.headObject(input.objectKey);
    if (!head.exists) {
      throw AppError.badRequest(
        "UPLOAD_NOT_FOUND",
        "We couldn't find that upload — it may not have finished, or the link expired",
      );
    }

    // A presigned PUT URL constrains content-type but not byte count, so
    // the size declared at presign time was only ever a client's claim —
    // this is the first point the *actual* uploaded size is known and can
    // be enforced. An oversized object is deleted rather than silently
    // registered (docs/SECURITY.md §7).
    const actualSize = head.sizeBytes ?? input.sizeBytes;
    const limit = maxBytesFor(input.mimeType);
    if (actualSize > limit) {
      await this.storage.deleteObject(input.objectKey).catch(() => undefined);
      throw AppError.badRequest(
        "UPLOAD_TOO_LARGE",
        `That file is larger than the ${Math.round(limit / (1024 * 1024))}MB limit for this file type`,
      );
    }

    const attachment = await this.prisma.client.attachment.create({
      data: {
        organizationId,
        entityType: input.entityType,
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        sizeBytes: actualSize,
        uploadedByStaffId: actorUserId,
        ...this.entityForeignKey(input.entityType, input.entityId),
      },
    });

    await this.audit.record({
      organizationId,
      entityType: "Attachment",
      entityId: attachment.id,
      action: "ATTACHMENT_ADDED",
      actorUserId,
      afterState: { entityType: input.entityType, entityId: input.entityId, mimeType: input.mimeType },
      jobId: input.entityType === "JOB" ? input.entityId : undefined,
    });

    return attachment;
  }

  async list(organizationId: string, entityType: AttachmentEntityType, entityId: string) {
    await this.assertEntityBelongsToOrg(organizationId, entityType, entityId);
    return this.prisma.client.attachment.findMany({
      where: { organizationId, ...this.entityForeignKey(entityType, entityId) },
      orderBy: { createdAt: "desc" },
    });
  }

  async getSignedUrl(organizationId: string, attachmentId: string) {
    const attachment = await this.getById(organizationId, attachmentId);
    const url = await this.storage.presignRead(attachment.objectKey);
    return { url, expiresIn: 600, mimeType: attachment.mimeType };
  }

  async remove(organizationId: string, attachmentId: string, actorUserId: string) {
    const attachment = await this.getById(organizationId, attachmentId);

    await this.prisma.client.attachment.delete({ where: { id: attachmentId, organizationId } });
    await this.storage.deleteObject(attachment.objectKey).catch(() => undefined);

    await this.audit.record({
      organizationId,
      entityType: "Attachment",
      entityId: attachmentId,
      action: "ATTACHMENT_REMOVED",
      actorUserId,
      beforeState: { objectKey: attachment.objectKey },
    });
  }

  private async getById(organizationId: string, attachmentId: string) {
    const attachment = await this.prisma.client.attachment.findFirst({
      where: { id: attachmentId, organizationId },
    });
    if (!attachment) {
      throw AppError.notFound("ATTACHMENT_NOT_FOUND", "Attachment not found");
    }
    return attachment;
  }

  private entityForeignKey(entityType: AttachmentEntityType, entityId: string) {
    switch (entityType) {
      case "JOB":
        return { jobId: entityId };
      case "DIAGNOSIS":
        return { diagnosisId: entityId };
      case "ESTIMATE":
        return { estimateId: entityId };
      case "VEHICLE":
        return { vehicleId: entityId };
    }
  }

  /** Authorization boundary: a caller can only attach files to a record that belongs to their own organization (docs/SECURITY.md §7). */
  private async assertEntityBelongsToOrg(organizationId: string, entityType: AttachmentEntityType, entityId: string) {
    let exists: unknown;
    switch (entityType) {
      case "JOB":
        exists = await this.prisma.client.job.findFirst({ where: { id: entityId, organizationId } });
        break;
      case "DIAGNOSIS":
        exists = await this.prisma.client.diagnosis.findFirst({ where: { id: entityId, organizationId } });
        break;
      case "ESTIMATE":
        exists = await this.prisma.client.estimate.findFirst({ where: { id: entityId, organizationId } });
        break;
      case "VEHICLE":
        exists = await this.prisma.client.vehicle.findFirst({ where: { id: entityId, organizationId } });
        break;
    }
    if (!exists) {
      throw AppError.notFound("ATTACHMENT_TARGET_NOT_FOUND", "The record you're attaching this file to was not found");
    }
  }
}
