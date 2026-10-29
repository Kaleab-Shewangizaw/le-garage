import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Models that carry organizationId directly (docs/DATABASE.md §3). Pure
 * line-item/child rows (EstimateItem, ApprovalItemDecision, InvoiceItem,
 * VehicleOwnerHistory, JobStatusEvent) are deliberately excluded — they're
 * reached only through an already-org-scoped parent lookup, per
 * DOMAIN.md/DATABASE.md.
 */
const TENANT_SCOPED_MODELS = new Set([
  "Garage",
  "StaffMember",
  "Customer",
  "Vehicle",
  "Job",
  "Diagnosis",
  "JobNote",
  "Estimate",
  "Approval",
  "JobPart",
  "JobLabor",
  "Invoice",
  "Payment",
  "Attachment",
  "ServiceRecord",
  "IdempotencyRecord",
  "ServiceProvider",
]);

/**
 * Models that span two tenants (docs/WORK-ORDERS.md). They have no single
 * organizationId, so every scoped query must name at least one side.
 */
const TWO_SIDED_MODELS: Record<string, string[]> = {
  WorkOrder: ["fleetOrganizationId", "garageOrganizationId"],
};

const OPERATIONS_REQUIRING_ORG_WHERE = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Mechanical guard against the #1 highest-risk bug in a multi-tenant
 * system (docs/SECURITY.md §1/§2): a query on a tenant-scoped model that
 * forgot to filter by organizationId. `findUnique`/`findUniqueOrThrow` on a
 * tenant-scoped model are blocked outright — a global-uniqueness lookup
 * (e.g. by id) is exactly the IDOR shape docs/AUTH.md §6 warns about, so
 * callers must use findFirst with organizationId in `where` instead.
 *
 * This checks query *shape* (is organizationId present in `where`), not
 * that the value is correct — it cannot replace code review / the
 * tenant-isolation test suite (docs/SECURITY.md §2), but it turns "forgot
 * to scope the query" from a silent leak into a thrown error in every
 * environment, including tests.
 */
export function withTenantScopeGuard(client: PrismaClient) {
  return client.$extends({
    name: "tenant-scope-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const sides = TWO_SIDED_MODELS[model];
          if (sides) {
            if (operation === "findUnique" || operation === "findUniqueOrThrow") {
              throw new Error(`Tenant-scope violation: ${model}.${operation}() — use findFirst with ${sides.join(" or ")}.`);
            }
            if (OPERATIONS_REQUIRING_ORG_WHERE.has(operation)) {
              const where = (args as { where?: Record<string, unknown> } | undefined)?.where;
              // An OR is acceptable only if every branch is itself scoped to a side.
              const scoped = (w: Record<string, unknown>) => sides.some((k) => k in w);
              const orBranches = where && Array.isArray(where.OR) ? (where.OR as Record<string, unknown>[]) : null;
              if (!where || !(scoped(where) || (orBranches && orBranches.length > 0 && orBranches.every(scoped)))) {
                throw new Error(`Tenant-scope violation: ${model}.${operation}() must filter by ${sides.join(" or ")}.`);
              }
            }
            return query(args);
          }

          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            throw new Error(
              `Tenant-scope violation: ${model}.${operation}() bypasses organizationId scoping. ` +
                `Use findFirst({ where: { id, organizationId } }) instead. See docs/SECURITY.md §2.`,
            );
          }

          if (OPERATIONS_REQUIRING_ORG_WHERE.has(operation)) {
            const where = (args as { where?: Record<string, unknown> } | undefined)?.where;
            if (!where || !("organizationId" in where)) {
              throw new Error(
                `Tenant-scope violation: ${model}.${operation}() is missing organizationId in its ` +
                  `where clause. See docs/SECURITY.md §2.`,
              );
            }
          }

          return query(args);
        },
      },
    },
  });
}

export type TenantScopedPrismaClient = ReturnType<typeof withTenantScopeGuard>;
