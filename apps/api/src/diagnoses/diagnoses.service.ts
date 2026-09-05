import { Injectable } from "@nestjs/common";
import type { CreateDiagnosisInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class DiagnosesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    return this.prisma.client.diagnosis.findMany({
      where: { jobId, organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(organizationId: string, jobId: string, actorStaffId: string, actorUserId: string, input: CreateDiagnosisInput) {
    await this.assertJobExists(organizationId, jobId);

    // Diagnoses are append-only (docs/DOMAIN.md §3) — there is deliberately
    // no update/delete method on this service. A correction is a new entry.
    const diagnosis = await this.prisma.client.diagnosis.create({
      data: { organizationId, jobId, authorStaffId: actorStaffId, ...input },
    });

    await this.audit.record({
      organizationId,
      entityType: "Diagnosis",
      entityId: diagnosis.id,
      action: "DIAGNOSIS_ADDED",
      actorUserId,
      afterState: diagnosis,
      jobId,
    });

    return diagnosis;
  }

  private async assertJobExists(organizationId: string, jobId: string) {
    const job = await this.prisma.client.job.findFirst({ where: { id: jobId, organizationId, deletedAt: null } });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }
}
