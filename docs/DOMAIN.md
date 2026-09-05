# Domain Model — Le Garage

This is the conceptual model. The physical schema (types, constraints,
indexes) lives in `DATABASE.md` and `packages/database/prisma/schema.prisma`.
If they ever disagree, the Prisma schema is the executable truth and this
doc is stale — fix the doc.

## 1. Entity overview

```
Organization (tenant)
 └─ Garage (1:1 with Organization in MVP — see §7)
     ├─ StaffMember (User ↔ Garage, with Role)
     ├─ Customer
     │    └─ Vehicle (via CustomerVehicle / current-owner link)
     ├─ Vehicle (durable identity, independent of Customer)
     │    └─ VehicleOwnerHistory
     └─ Job  ← THE SPINE
          ├─ JobStatusEvent (state machine audit trail)
          ├─ Diagnosis (0..n, append-only findings)
          ├─ JobNote (0..n, append-only freeform technician/staff notes)
          ├─ Estimate (0..n, versioned — the quoted/proposed scope)
          │    └─ EstimateItem (0..n, part/labor lines)
          ├─ Approval (records what was approved/rejected, per estimate version)
          ├─ JobPart (0..n, parts actually consumed on this job)
          ├─ JobLabor (0..n, labor actually performed on this job)
          ├─ Invoice (0..n, versioned — generated from actual JobPart/JobLabor, not from EstimateItems)
          │    └─ InvoiceItem
          ├─ Payment (0..n, against an Invoice)
          ├─ Attachment (photos/videos/docs, attached to Job/Diagnosis/etc.)
          └─ ServiceRecord (1, written on COLLECTED — durable owner-facing history)

User (platform identity) ──< StaffMember (garage staff)
User ──< OwnerProfile (vehicle owner) [Phase 10]
AuditLog — cross-cutting, references any entity by type+id
Notification — cross-cutting, references a User + channel + payload
```

## 2. Multi-tenancy

`Organization` is the tenant boundary. In MVP, one `Organization` has exactly
one `Garage` (see §7 for why we still model them as two entities). Every
tenant-scoped table carries `organizationId` (denormalized onto child rows,
not just reachable via join) so that:

- every query can and must filter by `organizationId`
- a Postgres Row-Level-Security policy (or, in MVP, a mandatory Prisma
  middleware/interceptor) can enforce isolation even if application code
  forgets a `where` clause

See `SECURITY.md` §Tenant Isolation for enforcement details.

## 3. Core entities (MVP)

### User
Platform login identity. Has credentials (or OAuth identity later) and can
hold **one or more roles across contexts**: a `StaffMember` role at a garage,
and/or an owner identity. Kept separate from `StaffMember`/owner profile so
one human can, in principle, be both a garage staff member and a vehicle
owner without two accounts.

### Organization
The billing/tenant root. Exists so a garage's data (and future multi-branch
expansion) has a stable root that isn't the `Garage` record itself.

### Garage
The physical workshop profile: name, address, phone, business hours, verification
status. In MVP, `Garage.organizationId` is unique (1:1). Kept as a separate
entity from `Organization` because multi-branch (`ROADMAP.md` Phase 2+) means
one `Organization` will eventually own multiple `Garage` locations — modeling
this split now avoids a breaking migration later.

### StaffMember
Join entity: `User` × `Garage` × `Role` (`OWNER`, `MANAGER`, `TECHNICIAN`,
`FRONT_DESK`). A user can be staff at more than one garage in theory (not a
target scenario in MVP, but not prevented). Role drives authorization — see
`AUTH.md`.

### Customer
A person or company the garage does business with. Deliberately **not**
merged with `User`/owner accounts in MVP: a garage can create a `Customer`
record for someone who has never signed up for the owner app (this is the
common case at launch — most customers won't have the app yet). When an
owner later signs up, their `User`/owner identity can be linked to existing
`Customer` records (matched by phone number) — see `OPEN_QUESTIONS.md`.

### Vehicle
Durable identity, **independent of both `Customer` and license plate**. See
§4 below — this is one of the most important modeling decisions in the
system.

### VehicleOwnerHistory
Append-only record of which `Customer` was the recorded owner of a `Vehicle`
over which time range. Enables "multiple owners over time" (§7 of the
top-level brief) without losing history when ownership changes. Also the
source of truth for owner-mobile's "my vehicles" query (`OWNER-APP.md`
§6) — a vehicle currently belongs to whichever `Customer`'s row here has
`endedAt: null`.

### CustomerLink (Phase 10 — owner-mobile)
Connects an owner-mobile `User` (no staff membership) to a garage-side
`Customer` record — potentially several, one per organization the same
real person has used. Matched by phone number but never auto-created:
`GET /owner/customer-matches` only *surfaces* candidates, and creating
the link (`POST /owner/customer-links`) re-verifies the phone match
server-side. See `OWNER-APP.md` §5 for the full flow and
`OPEN_QUESTIONS.md` #3 for the reasoning this resolved.

### Job (Job Card)
The spine entity. One `Job` = one visit/repair cycle for one `Vehicle` at one
`Garage`. Everything else in the lifecycle hangs off `jobId`. See §5 State
Machine below.

### Diagnosis
Append-only findings recorded by a technician against a `Job`: observed
problem, suspected/confirmed cause, severity, recommended repair, notes,
attachments. Multiple diagnosis entries can exist per job (initial diagnosis,
then "found something else while we had it open"). Never edited after
creation — corrections are new entries, so the record stays honest. This
matters for dispute resolution (`SECURITY.md`/`PRODUCT.md` §Trust).

### Estimate / EstimateItem
An `Estimate` is **versioned**, never overwritten. See §6 below — this is
the second most important modeling decision after vehicle identity.

### Approval
Records what a customer approved/rejected against a specific `Estimate`
version, when, and (in MVP) how (in-app action; phone/verbal approval logged
manually by staff with a required note, since not all customers will be on
the app at launch). Approval is scoped to specific `EstimateItem`s so
"approve selected items" is a first-class case, not a workaround.

### JobNote
Freeform, append-only technician/staff log entries on a `Job` — the
"technician notes" concept from the workflow brief, distinct from
`Diagnosis` (structured problem/cause/severity findings, used for both the
initial diagnosis and "additional findings" discovered mid-repair) and
`JobLabor` (billable work performed). A quick update like "waiting on
customer callback" or "test drove, no more noise" doesn't fit either of
those, so it gets its own lightweight home rather than overloading
`Diagnosis`'s more formal shape.

### Part (JobPart in MVP)
In MVP, parts are recorded **in relation to a job**, not as a standalone
inventory system (per `PRODUCT.md` §8 / brief §14). Fields: name, part
number, brand, condition (new/used/refurbished), supplier, quantity, unit
cost, unit selling price, warranty period, and whether customer-supplied or
garage-supplied. A standalone `Inventory` entity is explicitly deferred
(`ROADMAP.md` Phase 2+) — the schema does not block adding it (a future
`InventoryItem` can be referenced optionally from `JobPart`). Any staff
member can add a part (a technician logging what they installed is core to
the workflow); changing or removing one requires a front-office role
(`OWNER`/`MANAGER`/`FRONT_DESK`), since parts feed directly into invoicing.
Locked once the job has an `ISSUED` invoice — see Invoice below.

### Labor (JobLabor in MVP)
Work performed: description, technician, hours/time, rate, and an explicit
billable `amount` (never silently derived from `hours * rate` — the amount
is always what's actually charged). Kept as job-scoped line items, not a
separate timesheet/payroll system. Same create/edit role split and
invoice-lock as `JobPart`.

### Invoice / InvoiceItem
**Generated from the job's actual recorded `JobPart`/`JobLabor` entries —
not from the `Estimate`.** The estimate was the quote; parts/labor are what
actually happened during the repair, and that's what gets billed. MVP does
not cross-validate `JobPart`/`JobLabor` against the approved
`EstimateItem`s (no product-matching heuristics) — the platform trusts the
garage to only record work within the approved scope; see
`OPEN_QUESTIONS.md`.

Versioned like `Estimate` (§6): a `DRAFT` invoice is mutable in place
(regenerated whenever parts/labor change), but once `ISSUED` it is frozen —
a correction **voids** it and generates a new version, linked via
`supersedesInvoiceId`. Parts and labor are locked (no create/update/delete)
while an `ISSUED` invoice is active for the job, so the invoice can never
silently drift out of sync with what it was built from; voiding the
invoice is the explicit, audited unlock. An `ISSUED` invoice with
non-voided payments against it cannot be voided — void the payments first.

### Payment
Amount, method (`CASH`, `TELEBIRR`, `BANK_TRANSFER`, `OTHER`), date,
reference, against an `Invoice`. Multiple partial payments allowed; a
payment that would exceed the current outstanding balance is rejected
outright rather than allowed to create a negative balance. Outstanding
balance is derived (`invoice.total - sum(non-voided payments)`), never
stored redundantly as a mutable field. A payment can be voided (a data-
entry correction) but never deleted — `voidedAt` is set, the row stays as
history.

### Attachment
Photo/video/document, polymorphically attached to a `Job`, `Diagnosis`,
`Estimate`, or `Vehicle`. Stored in S3-compatible object storage; the DB row
holds metadata + URL/key only. See `SECURITY.md` §File Uploads.

### ServiceRecord
Written automatically, in the same transaction as the `COLLECTED`
transition — not a separate staff action. Immediately after, the job is
moved straight to the terminal `CLOSED` state (see §5) — "the customer
picked up the vehicle" and "this job's history is now permanently
recorded" are one atomic event, so a job can never end up `COLLECTED`
without a service record, and never has a service record without actually
having been collected. A durable, owner-facing summary (JSON: complaint,
diagnoses, notes, parts/labor performed, the approved estimate, the issued
invoice's total/balance, warranty) that survives even if the originating
`Job` row is later archived. This is the seed of the future **Digital
Vehicle Passport** (`ROADMAP.md`).

### AuditLog
Cross-cutting: `entityType`, `entityId`, `action`, `actorUserId`,
`organizationId`, `beforeState`/`afterState` (JSON), `createdAt`. Written by
a shared interceptor/service for every sensitive mutation (see
`SECURITY.md` §Auditability for the exact action list).

### Notification (foundation built in Phase 10, real push delivery deferred)
`userId`, `channel` (`PUSH`/`SMS`/`TELEGRAM`/`WHATSAPP`/`IN_APP`), `type`,
`title`, `body`, `payload`, `status`, `readAt`. `NotificationsService`
writes a row (always `IN_APP`/`SENT` today) whenever a job-relevant event
happens for a job whose customer has a linked owner — piggybacking on
`AuditService.record` the same way realtime updates do. The owner app
polls `GET /owner/notifications`. No device-token registration or actual
push-service integration exists yet — see `OWNER-APP.md` §9 and
`OPEN_QUESTIONS.md`.

## 4. Vehicle identity (critical decision)

**A license plate is not a vehicle's identity.** Plates change (resale,
re-registration, damaged plate). The system's primary key for a vehicle is
an internal `Vehicle.id` (UUID). Supporting fields:

- `vin` (chassis number) — nullable (not all vehicles/records will have it
  captured, especially at first intake in a low-friction flow), but
  **unique when present**, and the strongest available natural key for
  deduplication.
- `licensePlate` — current plate, indexed for fast intake lookup ("type the
  plate, find the vehicle"), but **not unique** over time (a plate can be
  reassigned after a vehicle is deregistered, and a vehicle can change
  plates).
- `PlateHistory` (deferred to Phase 2 if plate-change tracking is actually
  needed in practice; the `Vehicle.licensePlate` field is mutable and a
  simple `AuditLog` entry captures the change in the meantime — a full
  history table is not built until there's a concrete need).

Intake flow: staff types a plate → system searches `Vehicle.licensePlate`
(and, if entered, `vin`) → shows candidate matches → staff confirms existing
vehicle or creates a new one. This keeps intake fast (`UX.md`) while still
protecting the durable identity.

## 5. Job (Job Card) state machine

```
INTAKE
  → DIAGNOSING
  → WAITING_APPROVAL
  → APPROVED
  → WAITING_PARTS      (optional — only if parts aren't on hand)
  → IN_PROGRESS
  → QUALITY_CHECK
  → READY
  → COLLECTED
  → (CLOSED)            terminal, set after ServiceRecord is written

Side branches, reachable from most non-terminal states:
  → ON_HOLD             (customer unreachable, waiting on external factor)
  → CANCELLED           (terminal — customer declined all work, or withdrew vehicle)
```

Rules (enforced server-side, never trusted from the client):

- Transitions are a fixed table of `(fromStatus, toStatus, requiredRole)`.
  See `packages/database` / `apps/api` job state machine for the exact
  table; it is intentionally centralized in one place, not scattered across
  controllers.
- `DIAGNOSING → WAITING_APPROVAL` requires at least one `Estimate` to exist.
- `WAITING_APPROVAL → APPROVED` requires at least one `Approval` recording a
  decision on the current `Estimate` version. A full rejection with no
  approved items moves the job to `CANCELLED` (or back to `DIAGNOSING` if the
  garage proposes a revised estimate — a new estimate version, not an edit).
- Additional work discovered mid-repair does **not** silently expand scope:
  it requires a **new estimate version** and a **new approval**, even if the
  job is already `IN_PROGRESS`. The job does not need to leave
  `IN_PROGRESS` for this — approval state is tracked per estimate version,
  not by forcing a full status rollback. This is the mechanism that solves
  "you never told us this would cost extra."
- `READY → COLLECTED` requires the `Invoice` to exist; it does not require
  full payment (garages may release on partial payment/credit — that is a
  business decision per garage, not enforced by the platform in MVP).
- `COLLECTED` triggers `ServiceRecord` creation.
- Every transition writes a `JobStatusEvent` (who, when, from, to, optional
  note) — this is the operational audit trail the dashboard and disputes
  rely on.

This list adapts the brief's suggested lifecycle by making `WAITING_PARTS`
optional/non-linear (not every job needs parts) and by explicitly stating
how mid-repair scope changes are handled, since that was underspecified and
is one of the highest-value trust features in the product.

## 6. Estimate versioning (critical decision)

An `Estimate` is never mutated in place once it has been sent to a customer
or approved against. Model:

- `Estimate` has a `jobId`, a `version` (monotonically increasing per job),
  a `status` (`DRAFT`, `SENT`, `SUPERSEDED`, `APPROVED`, `REJECTED`), and
  `EstimateItem[]` (each with description, part/labor type, quantity, unit
  price, discount, tax — all in minor currency units, see `DATABASE.md`
  §Money).
- Editing an estimate that is still `DRAFT` mutates it in place (nothing has
  been shown to the customer yet).
- Once an estimate is `SENT`, any change creates a **new `Estimate` row**
  with `version + 1`, and marks the previous version `SUPERSEDED`. The old
  version and its items are never deleted.
- `Approval` rows reference a specific `(estimateId, EstimateItem[])`
  selection, so "what exactly did the customer agree to, and when" is always
  reconstructable, even months later in a dispute.
- The `Job`'s "currently authorized scope" is defined as: the union of
  `EstimateItem`s with an `APPROVED` `Approval` on the latest non-superseded
  `Estimate`.

## 7. Organization vs. Garage — why two entities in a single-garage MVP

The brief's MVP is single-garage-per-tenant in practice, but modeling
`Organization` (tenant/billing root) separately from `Garage` (physical
location/profile) now avoids a breaking schema migration when multi-branch
garages (`ROADMAP.md` Phase 2+) arrive — at that point `Organization` simply
gains more than one `Garage`. This is the one piece of "designing for later"
in the schema that is justified because retrofitting it after real tenant
data exists is materially harder than modeling it correctly on day one; it
adds one extra foreign key, not architectural complexity.

## 8. Trust & approvals (how the model encodes trust)

Trust is not a field — it is an emergent property of the model:

- Diagnoses are append-only (§3) — no silent rewriting of "what we found."
- Estimates are versioned (§6) — no silent rewriting of "what we quoted."
- Approvals are scoped and timestamped (§3/§6) — no silent scope expansion.
- Every status transition and every sensitive mutation is audit-logged
  (`SECURITY.md`).
- `ServiceRecord`s are durable and owner-visible even after a `Job` is
  archived — history cannot quietly disappear.

## 9. What's deliberately excluded from MVP's domain model

- Standalone `Inventory`/stock levels (parts are job-scoped only)
- Multi-branch `Garage` per `Organization` (schema allows it, MVP doesn't
  build the UI/API for it)
- `Appointment`/scheduling entity (jobs are created at intake, not booked in
  advance)
- `RoadsideRequest`, `TowRequest` (Phase 2+, see `ROADMAP.md`)
- `VehicleAssistantConversation` (future flagship, see `ROADMAP.md`)
- Insurance/claims entities

These are intentionally left out rather than stubbed, per the brief's
instruction not to build disconnected modules ahead of need.
