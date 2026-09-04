import { Injectable } from "@nestjs/common";
import type { CreateJobLaborInput, UpdateJobLaborInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";
import { assertJobNotInvoiced } from "../common/job-financial-lock";

@Injectable()
export class LaborService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    return this.prisma.client.jobLabor.findMany({
      where: { jobId, organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(organizationId: string, jobId: string, actorUserId: string, input: CreateJobLaborInput) {
    await this.assertJobExists(organizationId, jobId);
    await assertJobNotInvoiced(this.prisma, organizationId, jobId);

    const labor = await this.prisma.client.jobLabor.create({
      data: { organizationId, jobId, ...input },
    });

    await this.audit.record({
      organizationId,
      entityType: "JobLabor",
      entityId: labor.id,
      action: "JOB_LABOR_ADDED",
      actorUserId,
      afterState: labor,
    });

    return labor;
  }

  async update(organizationId: string, jobId: string, laborId: string, actorUserId: string, input: UpdateJobLaborInput) {
    const before = await this.getById(organizationId, jobId, laborId);
    await assertJobNotInvoiced(this.prisma, organizationId, jobId);

    const updated = await this.prisma.client.jobLabor.update({
      where: { id: laborId, organizationId },
      data: input,
    });

    await this.audit.record({
      organizationId,
      entityType: "JobLabor",
      entityId: laborId,
      action: "JOB_LABOR_UPDATED",
      actorUserId,
      beforeState: before,
      afterState: updated,
    });

    return updated;
  }

  async remove(organizationId: string, jobId: string, laborId: string, actorUserId: string) {
    const before = await this.getById(organizationId, jobId, laborId);
    await assertJobNotInvoiced(this.prisma, organizationId, jobId);

    await this.prisma.client.jobLabor.delete({ where: { id: laborId, organizationId } });

    await this.audit.record({
      organizationId,
      entityType: "JobLabor",
      entityId: laborId,
      action: "JOB_LABOR_REMOVED",
      actorUserId,
      beforeState: before,
    });
  }

  private async getById(organizationId: string, jobId: string, laborId: string) {
    const labor = await this.prisma.client.jobLabor.findFirst({ where: { id: laborId, jobId, organizationId } });
    if (!labor) {
      throw AppError.notFound("JOB_LABOR_NOT_FOUND", "Labor entry not found");
    }
    return labor;
  }

  private async assertJobExists(organizationId: string, jobId: string) {
    const job = await this.prisma.client.job.findFirst({ where: { id: jobId, organizationId, deletedAt: null } });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }
}
