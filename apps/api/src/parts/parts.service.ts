import { Injectable } from "@nestjs/common";
import type { CreateJobPartInput, UpdateJobPartInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { assertNotGarageHandled } from "../common/work-order-lock";
import { AuditService } from "../audit/audit.service";
import { assertJobNotInvoiced } from "../common/job-financial-lock";

/**
 * Job-scoped parts (docs/DOMAIN.md §3, §9): parts live on the job, not a
 * standalone inventory system. This is deliberately the smaller of the two
 * things the brief calls out — "Part -> Job -> Invoice" before
 * "Part -> Inventory -> Warehouse -> Supplier marketplace".
 */
@Injectable()
export class PartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    return this.prisma.client.jobPart.findMany({
      where: { jobId, organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(organizationId: string, jobId: string, actorUserId: string, input: CreateJobPartInput) {
    await assertNotGarageHandled(this.prisma, organizationId, jobId);
    await this.assertJobExists(organizationId, jobId);
    await assertJobNotInvoiced(this.prisma, organizationId, jobId);

    const part = await this.prisma.client.jobPart.create({
      data: { organizationId, jobId, ...input },
    });

    await this.audit.record({
      organizationId,
      entityType: "JobPart",
      entityId: part.id,
      action: "JOB_PART_ADDED",
      actorUserId,
      afterState: part,
      jobId,
    });

    return part;
  }

  async update(organizationId: string, jobId: string, partId: string, actorUserId: string, input: UpdateJobPartInput) {
    await assertNotGarageHandled(this.prisma, organizationId, jobId);
    const before = await this.getById(organizationId, jobId, partId);
    await assertJobNotInvoiced(this.prisma, organizationId, jobId);

    const updated = await this.prisma.client.jobPart.update({
      where: { id: partId, organizationId },
      data: input,
    });

    await this.audit.record({
      organizationId,
      entityType: "JobPart",
      entityId: partId,
      action: "JOB_PART_UPDATED",
      actorUserId,
      beforeState: before,
      afterState: updated,
      jobId,
    });

    return updated;
  }

  async remove(organizationId: string, jobId: string, partId: string, actorUserId: string) {
    await assertNotGarageHandled(this.prisma, organizationId, jobId);
    const before = await this.getById(organizationId, jobId, partId);
    await assertJobNotInvoiced(this.prisma, organizationId, jobId);

    await this.prisma.client.jobPart.delete({ where: { id: partId, organizationId } });

    await this.audit.record({
      organizationId,
      entityType: "JobPart",
      entityId: partId,
      action: "JOB_PART_REMOVED",
      actorUserId,
      beforeState: before,
      jobId,
    });
  }

  private async getById(organizationId: string, jobId: string, partId: string) {
    const part = await this.prisma.client.jobPart.findFirst({ where: { id: partId, jobId, organizationId } });
    if (!part) {
      throw AppError.notFound("JOB_PART_NOT_FOUND", "Part not found");
    }
    return part;
  }

  private async assertJobExists(organizationId: string, jobId: string) {
    const job = await this.prisma.client.job.findFirst({ where: { id: jobId, organizationId, deletedAt: null } });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }
}
