import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

export interface AuditEntry {
  organizationId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
}

/**
 * Writes AuditLog rows for the sensitive-action list in docs/SECURITY.md §5.
 * Audit logs are write-only from the application's perspective — no
 * update/delete method exists here by design.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        beforeState: entry.beforeState as never,
        afterState: entry.afterState as never,
      },
    });
  }
}
