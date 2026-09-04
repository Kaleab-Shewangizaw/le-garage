import { Injectable } from "@nestjs/common";
import type { CreateCustomerInput, UpdateCustomerInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async search(organizationId: string, search?: string) {
    return this.prisma.client.customer.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async getById(organizationId: string, id: string) {
    const customer = await this.prisma.client.customer.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!customer) {
      throw AppError.notFound("CUSTOMER_NOT_FOUND", "Customer not found");
    }
    return customer;
  }

  async create(organizationId: string, actorUserId: string, input: CreateCustomerInput) {
    const customer = await this.prisma.client.customer.create({
      data: { organizationId, ...input },
    });

    await this.audit.record({
      organizationId,
      entityType: "Customer",
      entityId: customer.id,
      action: "CUSTOMER_CREATED",
      actorUserId,
      afterState: customer,
    });

    return customer;
  }

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateCustomerInput) {
    const before = await this.getById(organizationId, id);

    const updated = await this.prisma.client.customer.update({
      where: { id, organizationId },
      data: input,
    });

    await this.audit.record({
      organizationId,
      entityType: "Customer",
      entityId: id,
      action: "CUSTOMER_UPDATED",
      actorUserId,
      beforeState: before,
      afterState: updated,
    });

    return updated;
  }
}
