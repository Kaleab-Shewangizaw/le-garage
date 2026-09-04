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
