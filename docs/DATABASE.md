# Database — Le Garage

Executable schema: `packages/database/prisma/schema.prisma`. This doc
explains conventions and the reasoning; the schema file is authoritative for
exact types/constraints.

## 1. Conventions

- **Primary keys:** UUID (`@id @default(uuid())`) on every table. Never a
  business value (plate, email) as a primary key.
- **Timestamps:** every table has `createdAt` (`@default(now())`) and
  `updatedAt` (`@updatedAt`). Lifecycle tables (`Job`, `Estimate`, etc.) add
  explicit domain timestamps (e.g. `Job.collectedAt`) rather than inferring
  them from `updatedAt`, which is too blunt an instrument once a row can be
  touched for unrelated reasons.
- **Soft deletion:** applied only where "undo" or "still referenced by
  history" matters — `Customer`, `Vehicle`, `Job` use `deletedAt DateTime?`.
  Pure line-item/child tables (`EstimateItem`, `InvoiceItem`, `JobPart`) are
  hard-deletable **only while their parent is still `DRAFT`**; once a parent
  is sent/issued, children become immutable (§5, §6) and soft-delete is
  moot because nothing deletes them at all.
- **Tenant isolation:** every tenant-scoped table carries a direct
  `organizationId` column (not just reachable via a join chain), indexed,
  and is never queried without it. See `SECURITY.md` §Tenant Isolation for
  enforcement.
- **Enums:** modeled as Prisma `enum` (Postgres native enum) for fixed,
  rarely-changing sets (roles, statuses, payment methods). Not used for
  anything that might need runtime configuration later.
- **Naming:** singular PascalCase models (`Job`, not `Jobs`), camelCase
  fields, Prisma's default snake_case-free mapping kept as-is (Postgres
  table names match model names via Prisma's default) for simplicity.

## 2. Money

**Never floating point.** All monetary amounts are stored as **integers in
minor currency units** (e.g. ETB cents — even though ETB is not typically
subdivided in daily cash use, storing minor units keeps arithmetic exact and
future-currency-safe) — field type `Int` (or `BigInt` if amounts could
plausibly exceed ~21M ETB major units, which they won't for a single job;
`Int` is sufficient here but documented so it's a deliberate choice, not an
oversight).

Every money-bearing table also carries a `currency` field
(`Currency` enum, default/only value `ETB` in MVP) rather than assuming a
global currency — so a second currency is a data change, not a schema
migration, if it's ever needed (`PRODUCT.md` §9).

Derived amounts (invoice balance, job total) are **computed at read time**
from line items and payments, never stored as a separately-mutable field
that can drift out of sync. Where a computed total is expensive to
recompute repeatedly (e.g. dashboard aggregates), it is cached in a
read-model/materialized query, clearly named `...Cached` or served from a
dedicated dashboard query — never confused with the source of truth.

## 3. Tenant isolation

- `Organization` is the tenant root.
- `Garage`, `StaffMember`, `Customer`, `Vehicle`, `Job`, and everything job-
  scoped (`Diagnosis`, `Estimate`, `Approval`, `JobPart`, `JobLabor`,
  `Invoice`, `Payment`, `Attachment`, `ServiceRecord`) all carry
  `organizationId` directly, even though most are also reachable via
  `jobId → Job.organizationId`. Direct denormalization means every query
  can filter on `organizationId` without a join, and a Prisma middleware
  (`apps/api/src/common/tenant-scope`) can mechanically enforce "every
  tenant-scoped query must include organizationId" instead of relying on
  every engineer remembering it in every controller.
- See `SECURITY.md` §Tenant Isolation for the guard/middleware
  implementation and the test strategy that backs this.

## 4. Vehicle identity

```
Vehicle
  id            uuid pk
  organizationId  -- NOTE: see below, vehicles are owned by the garage that
                     first recorded them, but see OPEN_QUESTIONS.md re:
                     cross-garage vehicle history in a multi-garage future
  vin           string? , unique when not null
  licensePlate  string, indexed (not unique — see DOMAIN.md §4)
  make, model, year, color, mileage (last known)
  createdAt/updatedAt/deletedAt
```

`vin` uses a **partial unique index** (`@@unique([vin])` with Prisma's
support for nullable-unique — Postgres unique indexes already ignore NULLs,
so multiple vehicles with unknown VIN are allowed). `licensePlate` is
indexed but not unique, matching `DOMAIN.md` §4.

**Assumption (see OPEN_QUESTIONS.md):** MVP scopes `Vehicle` to the
`Organization` that first recorded it — i.e., today, two different garages
recording "the same" real-world car produce two different `Vehicle` rows.
Cross-garage vehicle identity resolution (one canonical vehicle visible to
all garages it has visited, with per-garage history) is a real future need
(it's necessary for the full Vehicle Passport vision) but requires careful
handling of what a *garage* is allowed to see about a vehicle's history at
*other* garages, which is a product/trust decision, not just an engineering
one. Deferred; flagged as an open question rather than silently designed
around.

## 5. Job Card & state machine

`Job` carries `status` (enum, see `DOMAIN.md` §5), `organizationId`,
`garageId`, `vehicleId`, `customerId`, `assignedTechnicianId?`, and
lifecycle timestamps (`intakeAt`, `diagnosingAt`, `readyAt`, `collectedAt`,
etc. — nullable, set as the job passes through each stage).

`JobStatusEvent` is an append-only log: `jobId`, `fromStatus`, `toStatus`,
`actorUserId`, `note?`, `createdAt`. The `Job.status` column is a
denormalized "current state" for fast querying/indexing; `JobStatusEvent`
is the source of truth for history. Transitions are validated in the
`jobs` service against the fixed transition table in `DOMAIN.md` §5 —
**never** by a raw `UPDATE ... SET status`.

Index: `@@index([organizationId, status])` — this is the query the garage
dashboard runs constantly ("show me all jobs in X status").

`JobNote` is a second, separate append-only child of `Job` — freeform
technician/staff notes (`DOMAIN.md` §3), distinct from `JobStatusEvent`
(system-generated transition history) and `Diagnosis` (structured
findings). Unlike `JobStatusEvent`, it carries `organizationId` directly
(it's listed in the tenant-scope guard's model set,
`packages/database/src/tenant-scope.ts`) since it's queried on its own
merits, not only ever reached via an already-scoped `Job`.

Reaching `COLLECTED` (`transitionStatus` in `apps/api/src/jobs/
jobs.service.ts`) runs inside one database transaction that also gathers
diagnoses/notes/parts/labor/the approved estimate/the issued invoice,
writes the `ServiceRecord`, and immediately transitions the job again to
`CLOSED` with its own `JobStatusEvent` — all four things (status write,
`ServiceRecord`, second status write, its event) commit atomically or not
at all.

## 6. Estimate versioning

```
Estimate
  id, jobId, organizationId
  version        Int          -- 1, 2, 3... per job
  status         EstimateStatus  DRAFT | SENT | SUPERSEDED | APPROVED | REJECTED
  currency, subtotal/tax/discount/total  -- Int minor units, computed from items but persisted at SENT time as a frozen snapshot
  createdByStaffId, createdAt, sentAt?, decidedAt?

EstimateItem
  id, estimateId, organizationId
  type           EstimateItemType  PART | LABOR
  description, quantity, unitPrice (Int), discount (Int), lineTotal (Int)
```

`@@unique([jobId, version])`. Moving from `DRAFT` to `SENT` is the only
transition that "freezes" an estimate; from that point, any change is
implemented as: mark current row `SUPERSEDED`, insert a new `Estimate` row
with `version + 1` and copies of the changed `EstimateItem`s. Nothing is
ever `UPDATE`d on a `SENT`-or-later estimate or its items — this is what
makes the audit trail in `DOMAIN.md` §6 actually true at the data layer,
not just a policy.

`Estimate.shareToken` (`String? @unique`) backs the customer share-link
feature (`DECISIONS.md` ADR-0018) — 192 bits of randomness, generated
lazily, looked up via the *unscoped* Prisma client (no organizationId to
scope by for an anonymous visitor). It is the one column in the schema
deliberately queried outside tenant scoping; see the doc comment on the
field itself and on `prismaUnscoped` in `packages/database/src/index.ts`.

## 7. Approvals

```
Approval
  id, jobId, estimateId, organizationId
  decidedByCustomerId (nullable if staff logged a verbal/phone approval)
  decidedByStaffId?   (set when staff records an approval on the customer's behalf — see AUTH.md)
  method          ApprovalMethod  IN_APP | VERBAL_LOGGED_BY_STAFF | PHONE
  itemDecisions   ApprovalItemDecision[]   -- one row per EstimateItem: APPROVED | REJECTED
  note?, createdAt
```

`ApprovalItemDecision` is a child table (`approvalId`, `estimateItemId`,
`decision`) so "approve selected items" is representable exactly, not
approximated with a free-text note.

## 8. Invoices & payments

```
Invoice
  id, organizationId, jobId  (NOT unique — versioned, like Estimate)
  version        Int
  status         InvoiceStatus  DRAFT | ISSUED | VOID
  subtotal/discountTotal/taxTotal/total  -- Int minor units
  supersedesInvoiceId  String?
  issuedAt, voidedAt   DateTime?

InvoiceItem
  id, invoiceId
  description, quantity, unitPrice (Int), discount (Int), lineTotal (Int)
```

`Invoice` is generated from the job's **actual recorded `JobPart`/
`JobLabor` rows** (`DOMAIN.md` §3) — not from `Estimate`/`EstimateItem`
directly. `@@unique([jobId, version])`, same pattern as `Estimate`
(`DATABASE.md` §6): a `DRAFT` invoice is mutated in place as parts/labor
change (its `InvoiceItem`s are deleted and recreated on each regeneration);
once `ISSUED` it is immutable. A correction voids the `ISSUED` invoice
(`status -> VOID`, `voidedAt` set) and a new `DRAFT` is generated as
`version + 1`, linked back via `supersedesInvoiceId`. Voiding is refused if
the invoice has any non-voided `Payment`s — void those first, so "this
invoice's money history changed" is never silent.

While a job has an `ISSUED` invoice, its `JobPart`/`JobLabor` rows are
locked (no create/update/delete) — enforced in `apps/api/src/common/
job-financial-lock.ts` — so the invoice can't silently drift from what it
was generated from.

`Payment`: `invoiceId`, `organizationId`, `amount` (Int), `method`
(`PaymentMethod` enum: `CASH`, `TELEBIRR`, `BANK_TRANSFER`, `OTHER`),
`reference?`, `paidAt`, `recordedByStaffId`, `voidedAt?`. Balance =
`invoice.total - SUM(payments.amount WHERE NOT voided)`. Never stored as a
mutable column. A payment that would push the balance negative is rejected
at the service layer (`apps/api/src/payments/payments.service.ts`), not
just documented as a convention.

## 9. Attachments and idempotency records

`Attachment`: `organizationId`, `entityType` (`JOB`/`DIAGNOSIS`/`ESTIMATE`/
`VEHICLE`), exactly one of `jobId`/`diagnosisId`/`estimateId`/`vehicleId`
set (matching `entityType`), `objectKey` (the S3/MinIO key — never a
public URL, `SECURITY.md` §7), `mimeType`, `sizeBytes`,
`uploadedByStaffId`. The row is only created after the API confirms (via
`HeadObjectCommand`) that the object was actually uploaded — a client
claiming success isn't trusted by itself.

`IdempotencyRecord`: `@@unique([organizationId, route, key])`, `status`
(`PENDING`/`COMPLETED`), `responseStatus`/`responseBody` captured once the
protected handler completes. Backs `Idempotency-Key` duplicate-action
protection (`DECISIONS.md` ADR-0015) — the unique constraint itself is
the concurrency primitive (a second `PENDING` insert attempt fails with
`P2002`), not an application-level lock. Rows are not currently swept —
flagged in `OPEN_QUESTIONS.md`.

## 10. Indexing strategy (MVP, based on actual expected queries)

- `Job(organizationId, status)` — dashboard board view
- `Job(organizationId, vehicleId)` — vehicle history / "jobs for this car"
- `Vehicle(organizationId, licensePlate)` — intake lookup
- `Vehicle(vin)` unique partial — dedupe
- `Customer(organizationId, phone)` — intake lookup / dedupe
- `Estimate(jobId, version)` unique
- `AuditLog(organizationId, entityType, entityId)` — "show history for this
  record"
- `Payment(invoiceId)`, `Invoice(jobId)`

No search-engine (Meilisearch) index in MVP; Postgres `ILIKE`/`pg_trgm` on
plate/phone/name is sufficient at expected MVP volume (`ARCHITECTURE.md`
§4).

## 11. Migrations

Prisma Migrate, committed to `packages/database/prisma/migrations`. No
manual SQL against production outside of a migration file. Seed script
(`packages/database/prisma/seed.ts`) creates a demo organization/garage/
staff/customer/vehicle for local development — see `DEVELOPMENT.md`.

## 12. Backup and recovery

**Every garage's entire business record — customers, vehicles, jobs,
estimates, invoices, payments — lives in this one Postgres database.**
Losing it is not an acceptable failure mode for a pilot, let alone
production.

**Strategy (MVP-appropriate — see `ROADMAP.md` for when this needs to
grow up):**

- **Frequency:** nightly `pg_dump -Fc` (custom format — supports
  selective/parallel restore, smaller than plain SQL) of the production
  database, retained for at least 14 days. For a pilot with a handful of
  garages, nightly is enough; revisit toward continuous WAL archiving
  (point-in-time recovery) before onboarding garages who'd lose a full
  day's jobs to a bad restore point.
- **Location:** the dump must land somewhere other than the database
  host's own disk — object storage (the same S3-compatible bucket
  infrastructure already in use for attachments, in a separate
  `backups/` prefix, or a dedicated bucket) is the practical MVP choice.
  A backup that lives next to the thing it backs up doesn't protect
  against host loss.
- **Restore procedure:**
  ```bash
  # Into a fresh/empty database:
  pg_restore -U legarage -d legarage --no-owner --role=legarage backup.dump
  ```
  This is not theoretical — it was exercised for real during this
  project's pilot-hardening pass: `pg_dump` from the running dev database,
  restored into a freshly created, completely separate Postgres container,
  with row counts, foreign-key joins, and index definitions verified to
  match afterward. The same procedure applies at any scale; only the
  `pg_dump`/`pg_restore` target flags change.
- **Recovery expectations:** for a pilot, "restore into a fresh instance
  and repoint `DATABASE_URL`" is an acceptable recovery path — a few
  minutes of restore time plus deployment time, and up to 24 hours of
  data loss (the gap since the last nightly dump) in the worst case. That
  RPO is a deliberate, documented tradeoff for pilot scale, not an
  oversight — tighten it (more frequent dumps, or WAL-based continuous
  backup) before this stops being true for real customers depending on
  it daily.
- **Object storage (MinIO/S3) backup:** photos/documents are the other
  thing that can't be regenerated. The same nightly-dump discipline
  applies at the bucket level (`mc mirror` or the S3 provider's built-in
  cross-region replication in production); not yet automated for local
  dev, since local dev data is disposable by definition.

**Not yet done** (tracked here rather than assumed): the nightly dump job
itself is not yet scheduled/automated in any environment — this section
documents the procedure and the tested restore path, not a running cron
job. Standing that up is an infrastructure task for whichever host
actually runs the pilot's production database, and is called out again in
`ROADMAP.md`.
