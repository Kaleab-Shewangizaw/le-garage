import { Injectable } from "@nestjs/common";
import type { CreateJobNoteInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    return this.prisma.client.jobNote.findMany({
      where: { jobId, organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(organizationId: string, jobId: string, actorStaffId: string, actorUserId: string, input: CreateJobNoteInput) {
    await this.assertJobExists(organizationId, jobId);

    // Append-only, like Diagnosis (docs/DOMAIN.md §3) — no update/delete here.
    const note = await this.prisma.client.jobNote.create({
      data: { organizationId, jobId, authorStaffId: actorStaffId, note: input.note },
    });

    await this.audit.record({
      organizationId,
      entityType: "JobNote",
      entityId: note.id,
      action: "JOB_NOTE_ADDED",
      actorUserId,
      afterState: note,
    });

    return note;
  }

  private async assertJobExists(organizationId: string, jobId: string) {
    const job = await this.prisma.client.job.findFirst({ where: { id: jobId, organizationId, deletedAt: null } });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }
}
