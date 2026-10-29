import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { NotificationsService } from "../notifications/notifications.service";
import { DomainEvents } from "../common/events/domain-events";

export interface AuditEntry {
  organizationId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  /**
   * When set, piggybacks a realtime `job:changed` broadcast on this audit
   * write (docs/ARCHITECTURE.md §"Realtime") — every meaningful mutation
   * already calls `audit.record`, so this is the one place live updates
   * fan out from rather than wiring a gateway call into every service.
   */
  jobId?: string | null;
  /** Also broadcasts `board:changed` — for mutations that affect the jobs list/dashboard, not just one job's own detail page. */
  affectsBoard?: boolean;
}

/**
 * Writes AuditLog rows for the sensitive-action list in docs/SECURITY.md §5.
 * Audit logs are write-only from the application's perspective — no
 * update/delete method exists here by design.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly events: DomainEvents,
  ) {}

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

    if (entry.organizationId && entry.jobId) {
      this.realtime.emitJobChanged(entry.organizationId, entry.jobId);
      if (entry.affectsBoard) {
        this.realtime.emitBoardChanged(entry.organizationId);
      }
      await this.notifications.notifyForJobEvent({
        organizationId: entry.organizationId,
        jobId: entry.jobId,
        action: entry.action,
        afterState: entry.afterState,
      });
    }

    await this.events.publish(entry);
  }
}
