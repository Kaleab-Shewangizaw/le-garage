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
