import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { from, Observable, of } from "rxjs";
import { catchError, switchMap } from "rxjs/operators";
import { Prisma } from "@le-garage/database";
import type { AccessTokenPayload } from "@le-garage/types";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../errors/app-error";

/**
 * Duplicate-action protection for critical mutations (docs/API.md §1,
 * brief "duplicate action protection"). A caller opts in by sending an
 * `Idempotency-Key` header; without one, this is a no-op passthrough —
 * every existing caller keeps working unchanged.
 *
 * With a key: a PENDING placeholder row is inserted under a unique
 * constraint on (organizationId, route, key) *before* the handler runs.
 * - If the insert succeeds, the handler runs normally; its response is
 *   stored and the row marked COMPLETED, or the row is deleted on error
 *   (so a genuinely failed attempt can be retried with the same key).
 * - If the insert fails (another request already holds this key): a
 *   COMPLETED row means this is a retry of an already-finished request —
 *   replay the stored response without re-executing the handler. A
 *   PENDING row means a concurrent duplicate is still in flight — reject
 *   with 409 rather than double-process (e.g. two near-simultaneous
 *   clicks on "Record payment").
 *
 * Applied via `@UseInterceptors(IdempotencyInterceptor)` on specific
 * routes only (job creation, estimate send, approval, invoice issuance,
 * payment recording, job status transition) — not globally; most GET/PATCH
 * traffic has no business being deduplicated this way.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const key = request.headers["idempotency-key"];
    const organizationId = request.user?.organizationId;

    if (!key || typeof key !== "string" || !organizationId) {
      return next.handle();
    }

    const route = `${request.method} ${context.getClass().name}.${context.getHandler().name}`;

    let recordId: string;
    try {
      const created = await this.prisma.client.idempotencyRecord.create({
        data: { organizationId, route, key, status: "PENDING" },
      });
      recordId = created.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.prisma.client.idempotencyRecord.findFirst({
          where: { organizationId, route, key },
        });
        if (existing?.status === "COMPLETED") {
          return of(existing.responseBody);
        }
        throw AppError.conflict(
          "DUPLICATE_REQUEST_IN_PROGRESS",
          "This request is already being processed — please wait a moment",
        );
      }
      throw err;
    }

    return next.handle().pipe(
      // Await the COMPLETED write before the response reaches the client —
      // otherwise a retry that arrives faster than this write could slip
      // through unprotected (docs/SECURITY.md — closing the race window).
      switchMap((responseBody: unknown) =>
        from(
          this.prisma.client.idempotencyRecord
            .update({
              where: { id: recordId, organizationId },
              data: { status: "COMPLETED", responseStatus: 200, responseBody: (responseBody ?? null) as never },
            })
            .then(() => responseBody),
        ),
      ),
      catchError((err) => {
        void this.prisma.client.idempotencyRecord.delete({ where: { id: recordId, organizationId } }).catch(() => undefined);
        throw err;
      }),
    );
  }
}
