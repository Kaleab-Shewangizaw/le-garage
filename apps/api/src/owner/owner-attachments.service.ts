import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { StorageService } from "../common/storage/storage.service";
import { OwnerAccessService } from "./owner-access.service";

/**
 * Photo/document evidence (brief §13 — "a digital record of what happened
 * to my car"). Every attachment traces back to a job or a vehicle either
 * directly or through its parent (Diagnosis/Estimate both carry jobId) —
 * resolve to that and reuse the same ownership check as everything else.
 */
@Injectable()
export class OwnerAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: OwnerAccessService,
  ) {}

  async getSignedUrl(ownerId: string, attachmentId: string) {
    const attachment = await this.prisma.unscopedClient.attachment.findUnique({
      where: { id: attachmentId },
      include: { diagnosis: true, estimate: true },
    });
    if (!attachment) {
      throw AppError.notFound("ATTACHMENT_NOT_FOUND", "Attachment not found");
    }

    const jobId = attachment.jobId ?? attachment.diagnosis?.jobId ?? attachment.estimate?.jobId ?? null;
    if (jobId) {
      await this.access.assertJobAccess(ownerId, jobId);
    } else if (attachment.vehicleId) {
      await this.access.assertVehicleAccess(ownerId, attachment.vehicleId);
    } else {
      throw AppError.notFound("ATTACHMENT_NOT_FOUND", "Attachment not found");
    }

    const url = await this.storage.presignRead(attachment.objectKey);
    return { url, mimeType: attachment.mimeType };
  }
}
