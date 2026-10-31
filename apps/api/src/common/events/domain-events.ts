import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { AuditEntry } from "../../audit/audit.service";

type Handler = (entry: AuditEntry) => Promise<void>;

/**
 * In-process fan-out of audited mutations (docs/WORK-ORDERS.md). Every
 * meaningful change already goes through AuditService.record, so that is
 * the one place events are published from — the same choice made for
 * realtime and notifications (ADR-0016). Handlers run in-line (awaited) so
 * a request's side effects are complete when it returns, and a failing
 * handler is logged, never surfaced: a sync problem must not undo or fail
 * the action that triggered it.
 */
@Injectable()
export class DomainEvents {
  private readonly handlers: Handler[] = [];
  private readonly logger = new Logger("DomainEvents");

  subscribe(handler: Handler): void {
    this.handlers.push(handler);
  }

  async publish(entry: AuditEntry): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(entry);
      } catch (err) {
        this.logger.warn(`Handler failed for ${entry.action} on ${entry.entityType} ${entry.entityId}: ${(err as Error).message}`);
      }
    }
  }
}

@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class DomainEventsModule {}
