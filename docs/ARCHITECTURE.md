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
all of the above): a `TenantGuard` (organization scoping), a `RolesGuard`
(RBAC), a global `ValidationPipe` (Zod/class-validator at the boundary), a
global exception filter (structured error shape, `API.md`), and an
`AuditInterceptor` for the sensitive-action list in `SECURITY.md`.

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
| Realtime | Socket.IO | only where actually needed — initially: live job-board updates on the garage dashboard |
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
   │  fetch with access token       ├─ TenantGuard: resolve organizationId from token, attach to request
   │                                ├─ RolesGuard: check StaffMember.role against route requirement
   │                                ├─ ValidationPipe: validate body/query against Zod schema
   │                                ├─ Controller → domain Service → Prisma (scoped by organizationId)
   │                                ├─ AuditInterceptor: write AuditLog row for sensitive actions
   │                                └─ structured JSON response (API.md)
```

## 6. Data flow: garage action → owner visibility

There is no separate "sync" step. `garage-web` writes through the API into
the same Postgres tables that `owner-mobile` reads from (scoped to the
vehicles/jobs the owner has access to). The moment a diagnosis, estimate, or
status change is saved, it exists for the owner app to read — the two apps
share one backend and one data model by design (`PRODUCT.md` §3).

## 7. Offline & mobile

Not attempted broadly in MVP. `owner-mobile` (Phase 10) targets the specific
workflows that actually need resilience to flaky connectivity (viewing
already-fetched vehicle/job data, queuing an approval action). See
`ROADMAP.md` and `docs/DEVELOPMENT.md` for the offline approach when Phase
10 starts: local cache via a lightweight store (e.g. MMKV/SQLite), a small
outbox queue for write actions (approve/reject), and idempotent API writes
(client-generated idempotency keys) so a retried queued write can't double
apply. Garage-side intake photo capture will need a similar queued-upload
pattern before it's trustworthy on a workshop's real network — flagged here,
not built until that module is reached.

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
