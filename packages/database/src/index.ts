import { PrismaClient } from "@prisma/client";
import { withTenantScopeGuard, type TenantScopedPrismaClient } from "./tenant-scope";

export * from "@prisma/client";
export { withTenantScopeGuard } from "./tenant-scope";
export type { TenantScopedPrismaClient } from "./tenant-scope";

declare global {
  // eslint-disable-next-line no-var
  var __legaragePrismaBase: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __legaragePrisma: TenantScopedPrismaClient | undefined;
}

const base: PrismaClient =
  globalThis.__legaragePrismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

/**
 * Single shared, tenant-scope-guarded PrismaClient instance per process
 * (docs/SECURITY.md §2). In dev, reused across hot reloads via globalThis
 * to avoid exhausting Postgres connections.
 */
export const prisma: TenantScopedPrismaClient = globalThis.__legaragePrisma ?? withTenantScopeGuard(base);

/**
 * The same underlying client, WITHOUT the tenant-scope guard. This exists
 * for exactly one legitimate use case: resolving which tenant an
 * authenticated identity belongs to, *before* an organizationId is known
 * (login, refresh-token rotation, signup) — see apps/api/src/auth. The
 * input to those queries is a verified identity (userId from a verified
 * JWT, or credentials checked first), never an attacker-supplied resource
 * id, so it is not the IDOR shape the guard exists to prevent
 * (docs/SECURITY.md §2, §6). The one other sanctioned use is the
 * PLATFORM_ADMIN console (apps/api/src/admin, docs/ADMIN.md), which is
 * cross-tenant by definition and audit-logs every write. Do not reach for
 * this anywhere else — every other tenant-scoped query must go through `prisma`.
 */
export const prismaUnscoped: PrismaClient = base;

if (process.env.NODE_ENV !== "production") {
  globalThis.__legaragePrismaBase = base;
  globalThis.__legaragePrisma = prisma;
}
