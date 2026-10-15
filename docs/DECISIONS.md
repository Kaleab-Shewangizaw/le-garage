# Architecture Decision Records — Le Garage

Short-form ADRs. Add a new entry rather than editing history when a
decision changes — mark the old one "Superseded by ADR-000X."

---

### ADR-0001: Modular monolith, not microservices

**Status:** Accepted

**Context:** The product is intended to become a large, long-lived
platform. There's a temptation to "build it right" with microservices from
day one.

**Decision:** One NestJS application (`apps/api`) with strongly-bounded
internal modules per domain concept. Docker Compose, not Kubernetes.

**Why:** At MVP scale (one pilot garage, then a handful), microservices add
network/deployment/observability complexity that slows development without
any corresponding benefit — there is no independent scaling need yet, and
premature service boundaries are usually wrong boundaries anyway (they get
redrawn once real usage patterns are known). NestJS's module system gives
most of the organizational benefit of service boundaries (DI, clear
ownership, testable seams) without the operational cost. If a specific
module (e.g. notifications, file processing) later has genuinely different
scaling/deployment needs, it can be extracted because the boundary already
exists in code.

---

### ADR-0002: No separate `packages/auth`

**Status:** Accepted

**Context:** The suggested monorepo layout in the brief includes
`packages/auth`.

**Decision:** Auth logic lives inside `apps/api`'s `auth` module. Shared
*types* (role enum, JWT payload shape) live in `packages/types`.

**Why:** A shared package earns its place when a second consumer actually
needs the *logic* (not just the types) it contains. Right now only
`apps/api` issues/verifies tokens; `garage-web`/`owner-mobile` only need to
know the shape of a JWT payload and attach a bearer token, which
`packages/types` already covers. Extract a `packages/auth` when a second
backend process needs to verify tokens independently — premature now.

---

### ADR-0003: Vehicle identity is internal-UUID + optional-unique-VIN, not license plate

**Status:** Accepted

**Context:** See `DOMAIN.md` §4.

**Decision:** `Vehicle.id` (UUID) is the identity. `vin` is unique when
present but nullable. `licensePlate` is indexed, mutable, not unique.

**Why:** Plates are reassigned and changed in the real world; treating them
as identity would silently merge unrelated vehicles or split one vehicle's
history across records. VIN is the correct natural key when available but
isn't always captured at a fast intake, so it can't be required.

---

### ADR-0004: Estimates are versioned, never mutated after being sent

**Status:** Accepted

**Context:** See `DOMAIN.md` §6, `SECURITY.md` §3.

**Decision:** `Estimate` rows are immutable once `SENT`; changes produce a
new row with an incremented `version`.

**Why:** This is the mechanism that makes "what did the customer actually
agree to" answerable months later, which is the single highest-leverage
trust feature identified in `PRODUCT.md`. An editable estimate is a
disputed invoice waiting to happen.

---

### ADR-0005: Money as integer minor units, not floats or a Decimal library, in application code

**Status:** Accepted

**Decision:** All monetary columns are `Int` minor units (e.g. ETB cents).
Application-layer arithmetic operates on integers.

**Why:** Floating point is unacceptable for money (standard, non-negotiable
reasoning). A `Decimal` type/library is a reasonable alternative, but plain
integer minor units are simpler, have no serialization edge cases across
Prisma/JSON/TypeScript, and are sufficient because Le Garage doesn't need
fractional-minor-unit precision (no currency in scope subdivides below its
minor unit in practice). Revisit only if a future currency genuinely needs
sub-minor-unit precision.

---

### ADR-0006: `Organization` and `Garage` modeled separately even though MVP is 1:1

**Status:** Accepted

**Context:** See `DOMAIN.md` §7.

**Decision:** Keep both entities now, with a `@@unique` on
`Garage.organizationId` enforcing 1:1 in MVP.

**Why:** This is the one deliberate "build for later" exception to the
brief's own "don't overengineer" instruction (§39), justified because
retrofitting a tenant/location split after real multi-tenant data exists is
a materially harder migration than carrying one extra foreign key from the
start. Everything else in the schema follows YAGNI; this one doesn't,
because the cost asymmetry (now vs. later) is unusually large.

---

### ADR-0007: Custom JWT auth module, not a managed identity provider, for MVP

**Status:** Accepted

**Context:** See `AUTH.md` §1.

**Decision:** Build auth using vetted libraries (argon2, jose/@nestjs/jwt)
inside `apps/api`, not Auth0/Clerk/Ory/etc.

**Why:** No consumer-scale or social-login requirement exists yet; adding
an external identity dependency before it's needed contradicts the
"simple now, powerful later" principle and adds a vendor dependency + cost
+ integration surface for a single-garage pilot. Revisit when owner-mobile
needs consumer-scale auth (Phase 10) or SSO is requested by a garage
customer.

---

### ADR-0008: pnpm + Turborepo for the monorepo

**Status:** Accepted

**Decision:** pnpm workspaces + Turborepo, as suggested in the brief.

**Why:** No strong reason to deviate — pnpm's disk-efficient, strict
node_modules resolution catches phantom-dependency bugs early, and
Turborepo's task caching/pipeline model fits the `apps/*` + `packages/*`
layout directly. Not revisited unless a concrete pain point emerges.

---

### ADR-0009: Workspace packages ship built `dist/`, not raw TS source

**Status:** Accepted

**Context:** `packages/database`/`types`/`validation` originally pointed
`package.json#main` at `src/index.ts`. This worked for `tsc --noEmit`
typechecking but broke `apps/api` at runtime: `nest start`'s non-webpack
mode runs plain `node dist/main.js`, and this Node version's native
(unflagged) TypeScript handling of `.ts` files applies strict ESM
resolution to extensionless relative imports, which normal TypeScript
source doesn't write for CommonJS. The failure mode was a confusing
`ERR_MODULE_NOT_FOUND` pointing at a workspace package's internal file.

**Decision:** Every shared package builds to `dist/` (`tsc -p
tsconfig.json`) and `package.json#main`/`#types` point there.
`apps/api`/`turbo.json`'s dependency graph (`dependsOn: ["^build"]`)
ensures packages are built before dependents. `dev` scripts run `tsc
--watch` so local iteration still sees changes quickly.

**Why:** This is also just the correct shape for a package a bundler-free
Node process consumes — no bundler-specific resolution magic required, and
it matches how these packages will be consumed once there's a second
backend or a build step for `garage-web`. See `docs/DEVELOPMENT.md` for
the full explanation kept next to the commands it affects.

---

### ADR-0010: Invoices are generated from actual `JobPart`/`JobLabor`, not from the `Estimate`

**Status:** Accepted

**Context:** `Estimate`/`EstimateItem` represent the **quote**: what the
garage proposed and the customer approved before work started. What
actually gets billed should reflect what actually happened during the
repair — which can differ in minor ways (a part substitution, slightly
different labor time) even within an approved scope.

**Decision:** `InvoicesService.generateDraft` builds `InvoiceItem` rows
from the job's `JobPart` and `JobLabor` rows, not from `EstimateItem`s.
MVP does **not** cross-validate that recorded parts/labor stay within the
approved estimate scope (no product-matching heuristics) — the garage is
trusted to record work honestly; this is flagged in `OPEN_QUESTIONS.md`
rather than silently assumed.

**Why:** An invoice generated from the *quote* would be wrong the moment
reality diverges from the plan (which is the common case, not the
exception, in vehicle repair). Generating it from the actual work log is
both more accurate and matches the brief's own phrasing: "Part → Job →
Invoice."

---

### ADR-0011: `Invoice` is versioned like `Estimate`; parts/labor lock once an invoice is `ISSUED`

**Status:** Accepted

**Context:** The original schema had `Invoice.jobId` as `@unique` (one
invoice per job ever), which cannot represent "void this invoice and issue
a corrected one" — exactly the correction strategy `DATABASE.md` §8
already committed to before any invoice code existed.

**Decision:** `Invoice` gained a `version` field and
`@@unique([jobId, version])`, mirroring `Estimate` exactly: `DRAFT` is
mutable in place, `ISSUED` is frozen, a correction `VOID`s the current one
and generates `version + 1`. Additionally, `JobPart`/`JobLabor` become
immutable (`apps/api/src/common/job-financial-lock.ts`) while an `ISSUED`
invoice exists for the job — otherwise ADR-0010's "invoice reflects actual
parts/labor" guarantee would silently stop being true the moment someone
edited a part after invoicing.

**Why:** Consistent with ADR-0004's reasoning for estimates: financial
documents that can be silently edited after being shown to a customer are
a dispute waiting to happen. The migration for this (`prisma/migrations/
..._job_notes_and_invoice_versioning`) landed before any real invoice data
existed, so the constraint change was free.

---

### ADR-0012: `COLLECTED` atomically writes the `ServiceRecord` and cascades to `CLOSED`

**Status:** Accepted

**Decision:** `JobsService.transitionStatus`, when `toStatus ===
COLLECTED`, gathers the job's diagnoses/notes/parts/labor/approved
estimate/issued invoice and writes a `ServiceRecord`, then immediately
performs a second transition to `CLOSED` with its own `JobStatusEvent` —
all inside the one database transaction that also wrote the `COLLECTED`
transition itself.

**Why:** `DOMAIN.md` describes `CLOSED` as "set after ServiceRecord is
written," i.e. an automatic consequence, not a separate staff decision —
there's no meaningful business action for a human to take between "vehicle
was collected" and "history is recorded." Making it one atomic operation
also removes an entire class of bug: a job stuck `COLLECTED` with no
service history because a second API call was never made, or a
`ServiceRecord` that exists for a job that technically never finished
transitioning.

---

### ADR-0013: `garage-web` stack — Next.js 15 (App Router), Tailwind, Radix primitives, TanStack Query, IBM Plex

**Status:** Accepted

**Context:** Building the first real UI, with an explicit brief to make it
feel like "premium software that happens to be incredibly easy to use,"
not a generic admin-dashboard template.

**Decision:**
- **Next.js 15 App Router**, client-heavy (most pages are `"use client"`)
  since this is an authenticated operational tool, not content that
  benefits from server rendering/SEO. Route groups `(auth)`/`(app)` split
  the unauthenticated shell from the protected one.
- **Tailwind CSS** with a small, deliberate token set (`tailwind.config.ts`)
  rather than an off-the-shelf component kit's default theme — see the
  design tokens below.
- **Unstyled Radix UI primitives** (`Dialog`, `Select`, `Tabs`,
  `DropdownMenu`) for the accessibility mechanics (focus trapping,
  keyboard nav, ARIA) — no shadcn/ui CLI scaffold; components in
  `src/components/ui` are hand-written against Radix, styled to the token
  system, because the brief explicitly rejects a template look and
  shadcn's default primitives read as exactly that template look until
  heavily reskinned anyway.
- **TanStack Query** for all server state (every list/detail page, every
  mutation) — no Redux/Zustand global store; there is no meaningful client
  state in this app that isn't either server data or per-component form
  state.
- **Typography:** IBM Plex Sans (UI text, headings) + IBM Plex Mono
  (license plates, VINs, money, mileage, timestamps — anywhere precise
  numbers are scanned or compared). Chosen over the ubiquitous
  Inter-everywhere SaaS default specifically because the mono face does
  real work here (tabular alignment for exactly the data types this
  product revolves around), not as decoration.
- **Color:** near-black ink on warm off-white paper (light-mode only in
  MVP — a garage front desk is a bright, daylight environment,
  `docs/UX.md` §"daylight glare"; dark mode isn't a stated need), one
  accent (`signal`, a dashboard-gauge amber/copper, `#C2540A`) reserved for
  primary actions and things that genuinely need attention, plus two
  desaturated status colors (`good`, `danger`). No gradients, no neon, no
  per-status rainbow badges.
- **Signature element:** the job timeline (`src/components/jobs/
  job-timeline.tsx`) — a connected-node stepper rendering the job's
  progress through `DOMAIN.md` §5's stages. Appears compact on every job
  row and full-size on every job detail page, so "where is this car right
  now" is answerable without reading a single label.

**Why:** The brief was explicit and detailed about visual restraint,
human-language copy, and not looking AI-generated-Dribbble/generic-SaaS —
these choices were made deliberately against that brief rather than
defaulting to the most common current stack (dark-mode-plus-neon-accent or
cream-plus-serif templates), see the design-plan reasoning captured in
conversation at implementation time. Component/token decisions live in
`tailwind.config.ts` and `src/app/globals.css` — change the design system
there, not by overriding classes ad hoc in individual components.

---

### ADR-0014: Job status transitions use optimistic concurrency (a `status` guard in the UPDATE's `WHERE`)

**Status:** Accepted

**Context:** Pilot-readiness audit (docs/DOMAIN.md §5, brief "job state
audit — test concurrent updates") found that `transitionStatus` read the
job's current status, validated a transition against it, then wrote the
new status unconditionally by `id` alone. Two concurrent requests reading
the same stale status could both pass validation; Postgres row-locking
serializes the two `UPDATE`s, but without a guard the second still
succeeds, silently overwriting the first and writing a `JobStatusEvent`
whose `fromStatus` no longer matched reality by the time it ran.

**Decision:** The `UPDATE`'s `WHERE` clause now includes `status:
fromStatus` (Prisma's extended-where-unique — `{id, organizationId,
status}` — same mechanism already used for tenant scoping). If zero rows
match (because another request already moved the job), Prisma throws
`P2025`, caught and surfaced as `409 JOB_CONCURRENTLY_MODIFIED` — "someone
else just updated this, refresh and try again" — instead of a silent
second write.

**Why:** This is standard optimistic concurrency control and the cheapest
correct fix available: no new locking infrastructure, no polling, just a
more precise `WHERE`. Verified under genuine concurrent load in
`test/security-hardening.e2e-spec.ts` (two simultaneous transitions from
the same status: exactly one succeeds, one gets 409, and the audit trail
has exactly one event, not two conflicting ones).

---

### ADR-0015: Idempotency-Key protection via a `PENDING`/`COMPLETED` row under a unique constraint, not a cache

**Status:** Accepted

**Context:** Brief's "duplicate action protection" — real users double-tap,
networks retry. Needed real protection for job creation, estimate send,
approval, invoice issuance, and payment recording, not just a disabled
button (which only protects against the very first double-click, not a
client-side retry after a timeout with no response received).

**Decision:** `IdempotencyRecord` (organizationId, route, key) is unique.
`IdempotencyInterceptor` inserts a `PENDING` row *before* the handler
runs; a second request with the same key either replays the stored
response (row is `COMPLETED`) or is rejected with 409 (row is still
`PENDING` — a genuinely concurrent duplicate). Opt-in via an
`Idempotency-Key` header — routes that don't send one are unaffected.
Applied via `@Idempotent()` only on the specific mutation routes named
above, not globally.

**Why:** A Redis-backed cache was the obvious alternative (Redis already
runs via docker-compose) but wasn't justified: this needs to be
transactionally consistent with the same Postgres the mutation itself
writes to (so a completed-but-not-yet-committed race can't slip through),
and the unique-constraint-as-mutex pattern gets that for free without a
second datastore's failure modes to reason about. Revisit if idempotency
records need a TTL/sweep at real volume — none exists yet, see
`OPEN_QUESTIONS.md`.

**Update (pilot-hardening browser walkthrough):** a full end-to-end
Playwright run through the whole job lifecycle surfaced that
`useTransitionJobStatus` — unlike `useCreateJob` and `useRecordPayment` —
never actually sent an `Idempotency-Key`, even though the server-side
route was already wrapped in `@Idempotent()`. A same-tick double-click on
a status button (e.g. "Mark ready for pickup" on a slow connection) hit
the concurrency guard's raw `JOB_CONCURRENTLY_MODIFIED` 409 instead of
being silently deduped — the safety net existed but wasn't wired up at
this specific call site. Fixed by threading a `useIdempotencyKey()`
through `StatusActionBar`, matching the existing pattern.

---

### ADR-0016: Realtime events piggyback on `AuditService.record`, not a gateway call in every service

**Status:** Accepted

**Context:** Brief wants live job-board updates (status changes, new
diagnosis, estimate sent, approval, payment, etc.) without turning the
whole app realtime. Wiring a `RealtimeGateway` call into every one of the
~15 mutation call sites across 9 services would work but duplicates a
decision ("does this action matter enough to broadcast?") that's already
being made at every one of those same call sites for auditing.

**Decision:** `AuditService.record()` takes optional `jobId` and
`affectsBoard` fields. When `jobId` is present, it emits a `job:changed`
socket event (room-scoped to the organization, docs/SECURITY.md §2) after
writing the audit row; `affectsBoard: true` also emits `board:changed`.
Every mutation that matters for audit already calls `audit.record` — this
makes it also the one place live updates fan out from, rather than a
second parallel call tree.

**Why:** Fewer places to remember to wire up, and the two concerns
(audit-worthy, broadcast-worthy) overlap almost completely in practice —
anything worth an audit trail is also worth telling other open tabs
about. Events carry only IDs, never payloads — the client always
refetches over REST (docs/ARCHITECTURE.md §"Realtime") — so there's no
risk of the socket message and the database disagreeing.

---

### ADR-0017: Object storage via a thin `StorageService` wrapping the S3 SDK against MinIO, not a managed upload service

**Status:** Accepted

**Decision:** `apps/api/src/common/storage/storage.service.ts` wraps
`@aws-sdk/client-s3` (MinIO locally, S3-compatible in production) behind
presign/head/delete methods. `FilesService` issues short-lived presigned
PUT URLs scoped to one exact object key and content-type; the browser
uploads directly to storage, and the API only registers the resulting
`Attachment` row after verifying (via `HeadObjectCommand`) that the
object actually exists.

**Why:** Matches the pattern already documented in `SECURITY.md` §7
before any file code existed — the API was always meant to never proxy
file bytes. The AWS SDK talking to MinIO's S3-compatible API means the
exact same code path runs unchanged against real S3 in production; no
managed upload provider (Uploadcare, Cloudinary, etc.) is justified at
pilot scale, and would be one more external dependency + cost for a
capability MinIO already provides via the infra that's already running.

---

### ADR-0018: Customer estimate sharing is a public read-only token link, not a full public-approval flow

**Status:** Accepted

**Context:** Brief §21/§24 wants a "customer-facing estimate" for the
pilot. A full public approval flow (customer taps Approve/Reject on their
own phone, no account) is the eventual Owner App experience, not
something to half-build inside garage-web.

**Decision:** `Estimate.shareToken` (192 bits random, unique, nullable —
generated lazily on first "Share with customer" click) backs one
unauthenticated route, `GET /public/estimates/:token`
(`PublicEstimatesController`, deliberately separate from the staff-facing
`EstimatesController`), returning read-only estimate + vehicle + garage
info. There is no public approval endpoint — approval is still staff-
logged (`VERBAL_LOGGED_BY_STAFF`/`PHONE`, docs/AUTH.md §7), matching how
most pilot customers won't have an owner account yet. The public page
says as much: "your garage will confirm this with you directly."

**Why:** This is the smallest slice that delivers real trust-building
value (the customer sees the same itemized estimate staff see, sent over
WhatsApp/Telegram/SMS, docs/ETHIOPIA.md §3) without inventing customer
authentication or a parallel approval-authorization model a few weeks
before the real Owner App would need to solve that properly. Security
rests entirely on token unguessability, not organizationId scoping —
there is no tenant context for an anonymous visitor to be scoped by; see
the reasoning inline in `EstimatesService.getByShareToken`.

---

### ADR-0019: Performance pass fixes real gaps found by measurement, defers image optimization

**Status:** Accepted

**Context:** Brief §6 asked for a performance audit — "measure first, fix
meaningful bottlenecks," not speculative optimization. A read-only audit
of every service method, the Prisma schema's indexes, unbounded queries,
and the frontend's image/query handling found: no N+1 patterns (list/
detail endpoints already batch via Prisma `include`); one genuinely
uncovered filter column (`Job.assignedTechnicianId`, used by the "my
assigned jobs" view with no index); two unbounded `findMany` calls
(`Attachment.list`, `Vehicle.jobHistory`/`serviceHistory`) that are
harmless at today's data volume but have no ceiling; and a frontend photo
tile that downloads a full-resolution phone photo to render an 80×80px
thumbnail, with no thumbnail generation anywhere in the upload pipeline.

**Decision:** Fixed the cheap, real, zero-risk items: added
`@@index([organizationId, assignedTechnicianId])` to `Job`
(`DATABASE.md` §5), and added `take: 100` to the three unbounded queries.
Deliberately did **not** build thumbnail generation or a batched-presign
endpoint for the frontend photo grid — logged as `OPEN_QUESTIONS.md` #19
instead.

**Why:** The index and `take` fixes are unambiguous wins with no
downside — exactly the "meaningful bottleneck" bar the brief set.
Thumbnail generation is a different category: it means running an image-
processing step (e.g. `sharp`) synchronously or via a job queue on
upload, storing a second object per photo, and picking a real "viewed"
size — that's new infrastructure, not a bottleneck fix, and at pilot
scale (a handful of garages, a handful of photos per job) the actual
bytes wasted are small. Building it now, before knowing whether photo
volume ever gets large enough to matter, is exactly the premature
feature work the brief's own philosophy (§29) warns against.

---

### ADR-0020: Owner-mobile is a second, independent authentication track — not an extension of staff auth

**Status:** Accepted

**Context:** Phase 10 (`OWNER-APP.md`) needs a vehicle owner to log in
from `apps/owner-mobile`. The existing `/auth` surface hard-requires an
active `StaffMember` row (`AuthService.login` throws
`NO_ACTIVE_STAFF_MEMBERSHIP` otherwise) — a pure vehicle-owner account has
none, so that endpoint was never usable for this. The question was
whether to generalize staff auth to cover both cases, or build a parallel
track.

**Decision:** A second, fully independent authentication track under
`/owner/auth/*` (`OwnerAuthController`/`OwnerAuthService`), sharing only
the underlying `User` table, argon2 hashing, and `RefreshToken`
rotation/reuse-detection machinery (`TokenService`, extended rather than
duplicated) — never the staff login endpoint itself. Concretely:

- A new `TokenKind` enum (`STAFF` | `OWNER`) on `RefreshToken`. Kind is a
  property of the *session*, not the user — the same person can hold a
  staff session (garage-web) and an owner session (owner-mobile)
  simultaneously with the same account, since nothing stops a mechanic
  from also owning a personal car serviced elsewhere. Rotation preserves
  whichever kind a session was issued as.
- `OwnerAccessTokenPayload` (`@le-garage/types`) is a deliberately
  minimal, separate shape from `AccessTokenPayload` — `{sub, jti}` only,
  no organizationId/garageId/role, since an owner isn't scoped to one
  tenant.
- Owner access tokens are signed with a **different secret**
  (`JWT_OWNER_ACCESS_SECRET`, distinct from `JWT_ACCESS_SECRET`), verified
  by a separate `OwnerJwtAuthGuard` applied per-route (owner controllers
  are `@Public()` to skip the global staff `JwtAuthGuard`, then apply
  `OwnerJwtAuthGuard` explicitly — the same pattern already established
  for the public estimate-share controller).
- `OwnerAccessService` is the single chokepoint every owner-facing
  service uses to verify a request's owner actually has a confirmed
  `CustomerLink` to the resource in question, using
  `prisma.unscopedClient` since an owner's data legitimately spans
  multiple organizations — the one legitimate exception to `SECURITY.md`
  §2's tenant-scoping rule, and the only place in the codebase where that
  exception is allowed.

**Why:** Generalizing the staff login endpoint to also accept owner
identities would have meant threading an "or it's an owner" branch
through code that `SECURITY.md`/`AUTH.md` already treat as the hardened,
tested core of the tenant-isolation model — real risk for a feature that
doesn't need to touch it at all. A separate secret is cheap (one more
environment variable) and turns "the two token kinds must never be
confused" from a code-review convention into something cryptographically
true: a staff token literally fails signature verification against the
owner secret, and vice versa — verified directly in
`test/owner-app.e2e-spec.ts`, not just asserted in review.

**A related fix surfaced along the way:** `jobs.service.ts`'s
`createIntake` never passed the resolved customer as a new vehicle's
owner (`VehicleOwnerHistory` requires an explicit `ownerCustomerId` that
garage-web's intake form never sent), so `VehicleOwnerHistory` — which
"my vehicles" depends on entirely — was empty for nearly every vehicle in
the system. `resolveVehicle` now defaults a new vehicle's owner to its
own job's customer unless a different owner is explicitly given, which is
true for the overwhelming majority of real intakes (the person dropping
the car off is its owner) and doesn't change behavior for the standalone
vehicle-creation endpoint, which already threads an explicit
`ownerCustomerId` when the caller provides one.
