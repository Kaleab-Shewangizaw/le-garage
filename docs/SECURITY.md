# Security — Le Garage

Security is a first-class requirement, not a hardening pass at the end.
This doc is the checklist every module is built against.

## 1. Threat model summary

Highest-value, highest-likelihood risks for this product, in priority
order (matches brief §32's own prioritization):

1. **Cross-tenant data leakage** — one garage seeing another garage's
   customers, vehicles, jobs, estimates, invoices, or payments. Catastrophic
   for trust; must be structurally hard to introduce, not just
   code-reviewed away.
2. **Unauthorized approval / scope tampering** — a job proceeding on work
   the customer never approved, or an approval record being forgeable/
   editable after the fact.
3. **Financial integrity** — incorrect invoice totals, payment double-
   counting, floating-point drift.
4. **IDOR/BOLA** — any endpoint that takes an ID and doesn't verify the
   caller's right to that specific resource.
5. **File upload abuse** — malicious file types, oversized uploads,
   unauthenticated access to another tenant's photos/documents.
6. **Credential/session compromise** — weak hashing, long-lived unrevoked
   tokens, brute-forceable login.

## 2. Tenant isolation (enforcement, not just convention)

- Every tenant-scoped Prisma model carries `organizationId` directly
  (`DATABASE.md` §3).
- A Prisma **middleware** (`apps/api/src/common/prisma/tenant-scope.middleware.ts`)
  intercepts queries on tenant-scoped models and requires an
  `organizationId` in the `where` clause when a tenant context is present
  on the request-scoped Prisma client; the API never constructs a raw
  Prisma client outside this wrapper for request-handling code paths.
- `TenantGuard` (`AUTH.md` §4) is applied globally by default (opt-out per
  route via `@Public()`/`@SkipTenantScope()` decorator for genuinely public
  or platform-admin routes), so a new endpoint is tenant-safe unless someone
  deliberately opts out — safe default, not safe-if-remembered.
- **Tests:** a dedicated tenant-isolation test suite
  (`apps/api/test/tenant-isolation.e2e-spec.ts`) creates two organizations
  and asserts, for every tenant-scoped resource type, that org A's token
  cannot read/write org B's records (expect `404`, per `AUTH.md` §6). This
  suite is treated as a release gate, not a nice-to-have.

## 3. Approval integrity

- Approvals reference an immutable `Estimate` version (`DATABASE.md` §6/7);
  the estimate they approved cannot change after the fact.
- Estimate mutation after `SENT` always creates a new version; there is no
  code path that updates a `SENT`/`APPROVED` estimate's items in place.
- `Job` transitions that depend on approval (`WAITING_APPROVAL → APPROVED`)
  are validated server-side against the existence of a matching `Approval`
  row — never inferred from client-supplied status alone.
- All of this is audit-logged (§5).

## 4. Financial integrity

- Integer minor-unit money everywhere (`DATABASE.md` §2) — no floats in any
  money-bearing column or calculation.
- Invoice totals and payment balances are computed from line items/payment
  rows at read time (or cached explicitly and labeled as a cache), never a
  hand-maintained running total that can drift.
- `Payment` creation and `Invoice` issuance are wrapped in DB transactions
  where multiple rows must change atomically.
- Financial calculation logic (line totals, tax, discounts, balance) lives
  in one pure, unit-tested module per concern — not duplicated inline in
  controllers.

## 5. Auditability

`AuditLog` entries are written (via `AuditInterceptor` + explicit calls for
actions that aren't simple HTTP mutations) for at minimum:

- estimate created / estimate version superseded / estimate approved /
  estimate rejected
- job status changed (also captured in `JobStatusEvent`, `DATABASE.md` §5)
- payment recorded / payment voided
- invoice issued / invoice voided
- staff member added / removed / role changed
- vehicle merged/deduped (once that exists)
- any `PLATFORM_ADMIN` action against tenant data

Each entry: `organizationId`, `entityType`, `entityId`, `action`,
`actorUserId`, `beforeState`/`afterState` (JSON snapshot where meaningful),
`createdAt`. Audit logs are **never** editable or deletable via any API
route (write-only from the application's perspective; retention/deletion,
if ever required for compliance, is an offline/manual DBA action, not an
API capability).

## 6. IDOR/BOLA

See `AUTH.md` §6. Summary rule enforced in code review and tests: **every
`findUnique`/`findFirst`/`update`/`delete` on a tenant-scoped model must
include `organizationId` in its `where` clause.** This is checked by the
tenant-isolation test suite (§2) at the behavioral level, and should be
grep-able (`findUnique(` usage on tenant-scoped models is avoided in favor
of a `findFirst` + `organizationId` helper) at the code level.

## 7. File uploads

- Uploads go to S3-compatible object storage via **presigned URLs** issued
  by the `files` module — the API never proxies raw file bytes through the
  NestJS process.
- Presigned URLs are scoped to a specific `organizationId`-prefixed object
  key (`{organizationId}/{entityType}/{entityId}/{uuid}.{ext}`), short-lived,
  and only issued after the caller's authorization to write to that entity
  is checked.
- Allowed MIME types are allow-listed (images: jpeg/png/webp; short video:
  mp4; documents: pdf) and enforced both client-side (fast feedback) and
  server-side (the presigned policy constrains content-type and max size —
  never trust the client's claimed type alone).
- Serving files back: private bucket, signed read URLs generated per
  request scoped to the requester's tenant/authorization — no public bucket
  listing, no guessable public URLs for tenant content.

## 8. Credentials & sessions

- Passwords hashed with argon2id (`AUTH.md` §1), never stored/logged in
  plaintext, never included in any API response or log line.
- Login endpoint rate-limited (per-IP and per-account) to blunt brute force.
- Refresh token rotation with reuse detection (`AUTH.md` §5).
- No sensitive data (tokens, password hashes) in structured logs — logging
  utility redacts known-sensitive field names by default.

## 9. Input validation

Every API boundary validates input against an explicit schema
(`packages/validation`, Zod) before it reaches a service — rejecting unknown
fields, wrong types, and out-of-range values. This is the "boundary"
referenced in brief §19.2; internal service-to-service calls within the
monolith trust their TypeScript types and do not re-validate.

## 10. Rate limiting

Applied via NestJS throttler at the gateway level for: login, refresh,
OTP request (owner app, Phase 10), and file-upload-URL issuance. Not
applied blanket across every read endpoint in MVP — targeted at the routes
that are actually abuse-prone.

## 11. What's explicitly deferred (and why that's acceptable for MVP)

- Postgres Row-Level-Security as a *second* enforcement layer beneath the
  Prisma middleware — valuable defense-in-depth, tracked in
  `OPEN_QUESTIONS.md`, not blocking MVP because the middleware + test suite
  already make tenant leakage structurally hard, and RLS adds real
  operational complexity (connection pooling with `SET LOCAL`, migration
  tooling interplay) that isn't justified before there are paying multi-
  tenant customers.
- Formal penetration testing — appropriate before onboarding real customer
  financial data at scale, not before a pilot.
- SOC2/compliance program — premature for a pre-revenue pilot; revisit if/
  when enterprise customers require it.
