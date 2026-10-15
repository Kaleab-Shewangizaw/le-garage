# Architecture — Le Garage

## 1. Architecture style

**Modular monolith**, not microservices. One deployable API process
(`apps/api`) with strongly-bounded internal modules per domain concept
(§3). This optimizes for speed of development and correctness now, while
keeping module boundaries clean enough that any module could be extracted
into its own service later **if** scale ever actually requires it — that is
a possibility we design for, not a plan we are executing.

Do not introduce Kubernetes, a service mesh, or inter-service RPC. Docker
Compose is sufficient for the foreseeable future of this product.

## 2. Monorepo layout

```
le-garage/
  apps/
    api/            NestJS — the modular monolith backend
    garage-web/     Next.js — garage staff web app (desktop/tablet/phone)
    owner-mobile/   React Native + Expo — vehicle owner app (Phase 10)
    admin-web/      Next.js — internal platform admin (thin, built alongside MVP hardening)
  packages/
    database/       Prisma schema + generated client + seed scripts (single schema, shared by all apps)
    types/           Shared TypeScript types/enums (mirrors Prisma enums, DTOs used across apps)
    validation/      Shared Zod schemas — used by API (request validation) and web/mobile (form validation)
    config/          Shared tsconfig/eslint/prettier base configs
    ui/              Shared shadcn/ui-based component library (created when garage-web needs its second screen, not before)
  infrastructure/
    docker/          docker-compose.yml, Dockerfiles
  docs/               source of truth (this directory)
```

`packages/auth` from the originally suggested layout was folded into
`apps/api`'s `auth` module + `packages/types` for shared token/role types.
A separate package added no value until a second backend service exists to
share it with — see `DECISIONS.md` ADR-0002.

## 3. Backend module map (`apps/api`)

Each module owns its own Prisma-model boundary and exposes a service other
modules call directly (in-process — no internal HTTP/queue hop for
synchronous reads). Modules:

```
auth            login, refresh, session, password hashing
users           User entity (platform identity)
organizations   tenant root
garages         garage profile, business hours
staff           StaffMember (user↔garage↔role)
customers       Customer CRUD, search
vehicles        Vehicle identity, search/dedupe by plate/VIN, owner history
jobs            Job Card + state machine + JobStatusEvent
diagnoses       Diagnosis entries
estimates       Estimate + EstimateItem, versioning
approvals       Approval records against estimate versions
parts           JobPart line items
labor           JobLabor line items
invoices        Invoice + InvoiceItem generation from approved scope
payments        Payment recording, balance calculation
service-history service Record generation on job completion
files           Attachment metadata + presigned upload URLs (S3-compatible)
notifications   structured notification records (Phase 11; stubbed interface now)
audit           AuditLog writer + query, shared interceptor
dashboard       read-model/aggregation endpoints for the garage "what's happening now" view
```

Cross-cutting (not domain modules, but framework-level concerns applied to
all of the above): `JwtAuthGuard` (authentication) + `RolesGuard` (RBAC) —
tenant scoping is *not* a separate guard, see `SECURITY.md` §2 for why —
a per-route `ZodValidationPipe` at the boundary, a global exception filter
(structured error shape, `API.md`), `AuditService` (also the realtime
event source, `SECURITY.md` §5, `DECISIONS.md` ADR-0016), and
`IdempotencyInterceptor` on the handful of routes that need duplicate-
action protection (`API.md` §1).

## 4. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Monorepo/build | Turborepo + pnpm workspaces | fast incremental builds/caching, one lockfile |
| Garage web | Next.js 14+, TypeScript, Tailwind, shadcn/ui | fast to build operational UI, SSR where useful, App Router |
| Owner mobile | React Native + Expo, TypeScript | one codebase for Android-first (and iOS later) target |
| Backend | NestJS, TypeScript | opinionated modular structure maps directly onto the domain module list, first-class DI/guards/interceptors for the cross-cutting concerns above |
| Database | PostgreSQL | relational integrity matters a lot here (money, state machines, foreign keys) |
| ORM | Prisma | type-safe schema-as-code, good migration story, single schema shared via `packages/database` |
| Cache/jobs | Redis + BullMQ | notification dispatch, async work (invoice PDF generation, etc.) — introduced when the first real async job exists, not speculatively |
| Realtime | Socket.IO | live job-board/detail updates — implemented; see §7a below |
| Search | Meilisearch | deferred until Postgres `ILIKE`/trigram search on customers/vehicles is demonstrably insufficient |
| File storage | S3-compatible object storage (MinIO locally, S3 in prod) | photos/videos/documents |
| Auth | Custom JWT-based auth in the `auth` module (access + refresh tokens), password hashing via argon2 | see `AUTH.md` for why not to "invent authentication," and why this isn't reinventing it |
| Infra | Docker + Docker Compose | Postgres, Redis, MinIO, API all composed locally; same images ship to a single-host or small-cluster production deploy |

Android-first, unreliable-connectivity, low-end-device realities inform the
mobile architecture (`ETHIOPIA.md`) but do not change this stack choice.

## 5. Request flow (garage web example)

```
garage-web (Next.js) ──HTTPS──> apps/api (NestJS)
   │                                │
   │  fetch with access token       ├─ JwtAuthGuard: verify JWT, attach organizationId/garageId/role to request
   │                                ├─ RolesGuard: check StaffMember.role against route requirement
   │                                ├─ ZodValidationPipe: validate body/query against a Zod schema
   │                                ├─ [IdempotencyInterceptor, if the route opts in: dedupe by Idempotency-Key]
   │                                ├─ Controller → domain Service → Prisma (organizationId threaded through,
   │                                │    mechanically enforced by a Prisma Client Extension — SECURITY.md §2)
   │                                ├─ AuditService.record(): write AuditLog row + realtime broadcast for sensitive actions
   │                                └─ structured JSON response (API.md)
```

## 6. Data flow: garage action → owner visibility

There is no separate "sync" step. `garage-web` writes through the API into
the same Postgres tables that `owner-mobile` reads from (scoped to the
vehicles/jobs the owner has access to). The moment a diagnosis, estimate, or
status change is saved, it exists for the owner app to read — the two apps
share one backend and one data model by design (`PRODUCT.md` §3).

## 7a. Realtime (implemented)

`apps/api/src/realtime/realtime.gateway.ts` — a Socket.IO `/realtime`
namespace, authenticated via the same access token passed in the
connection handshake, joining one room per `organizationId` (never
cross-tenant, `SECURITY.md` §2). Events (`job:changed { jobId }`,
`board:changed {}`) carry no data — `garage-web`'s `RealtimeSync`
component (mounted once in the authenticated app shell) just invalidates
the relevant TanStack Query keys on receipt, and the normal REST fetch
does the rest. The socket is not a source of truth and the app functions
correctly (just less instantly) if it never connects.

Emission is centralized: `AuditService.record()` optionally takes `jobId`/
`affectsBoard` and emits after writing the audit row, rather than every
service calling the gateway directly (`DECISIONS.md` ADR-0016) — since
almost everything worth broadcasting is also worth auditing.

## 7b. Offline & mobile resilience

**Garage web (implemented, scoped):** a `ConnectionBanner` shows when the
browser goes offline (`navigator.onLine` + the `online`/`offline` events)
so a dropped connection is visible rather than silently failing requests.
`Idempotency-Key` protection (`API.md` §1, `DECISIONS.md` ADR-0015) covers
the mutations where a client-side retry after a timeout would otherwise
risk double-applying: job creation and payment recording generate a
stable key per form-instance (rotated after success) via
`useIdempotencyKey`; the same backend mechanism is available to wire into
any other mutation. This is deliberately narrower than full offline
support — there is no local write queue or background sync in garage-web;
a request made while offline simply fails visibly and can be retried once
the banner clears.

**Owner mobile (Phase 10 — built, `OWNER-APP.md`):** simpler than the
outbox-queue design originally sketched here, matching garage-web's own
"deliberately narrower than full offline support" scope rather than
building ahead of evidence that more is needed. TanStack Query's
in-memory cache means already-fetched vehicle/job data stays visible
immediately on reopening a screen even before a fresh fetch resolves; no
local persistence store (MMKV/SQLite), no write-outbox queue, and no
optimistic mutations — approving/rejecting an estimate only updates what
the owner sees once the server has actually confirmed it
(`OWNER-APP.md` §12). Revisit if pilot usage with real owners on
real Ethiopian mobile networks shows this isn't enough.

## 8. Deployment topology (MVP)

Single Docker Compose stack: `api`, `postgres`, `redis`, `minio`,
`garage-web`. No Kubernetes. No microservices. No multi-region. This is
intentionally boring — see brief §16/§36 and `DECISIONS.md` ADR-0001.

## 9. Observability (MVP-appropriate)

Structured JSON logging from `apps/api` (request id, organizationId, userId
where available) from day one — it's nearly free and pays for itself
immediately in a multi-tenant system. Error tracking/metrics/tracing
integration is deferred to `ROADMAP.md` Phase 12 (hardening) rather than
built speculatively now.
