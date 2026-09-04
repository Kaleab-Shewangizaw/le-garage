import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

export interface UpdateGarageInput {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
}

@Injectable()
export class GaragesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(organizationId: string, garageId: string) {
    const garage = await this.prisma.client.garage.findFirst({
      where: { id: garageId, organizationId },
    });
    if (!garage) {
      throw AppError.notFound("GARAGE_NOT_FOUND", "Garage not found");
    }
    return garage;
  }

  async update(organizationId: string, garageId: string, actorUserId: string, input: UpdateGarageInput) {
    const before = await this.getCurrent(organizationId, garageId);

    const updated = await this.prisma.client.garage.update({
      where: { id: garageId, organizationId },
      data: input,
    });

    await this.audit.record({
      organizationId,
      entityType: "Garage",
      entityId: garageId,
      action: "GARAGE_UPDATED",
      actorUserId,
      beforeState: before,
      afterState: updated,
    });

    return updated;
  }
}
