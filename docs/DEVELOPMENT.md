# Development — Le Garage

## Prerequisites

- Node.js 20+ (developed against Node 22)
- pnpm (`corepack enable` or install via `npm i -g pnpm`)
- Docker + Docker Compose (for Postgres/Redis/MinIO)

## First-time setup

```bash
pnpm install

# Approve native build scripts (Prisma engines, argon2) — required once.
pnpm approve-builds   # select all, or rely on the pnpm.onlyBuiltDependencies
                       # allowlist already in the root package.json

# Start local infra (Postgres, Redis, MinIO)
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis minio
```

**Port note:** `infrastructure/docker/docker-compose.yml` maps Postgres to
host port **5442** (not 5432) and Redis to **6380** (not 6379). This is
deliberate — a dev machine often already has a native Postgres/Redis or
other projects' containers bound to the standard ports, and this stack is
meant to be a self-contained, isolated addition, not a conflict. If those
ports are free on your machine, feel free to change the mapping — just keep
`apps/api/.env`'s `DATABASE_URL` in sync.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.example packages/database/.env   # prisma CLI reads its own package's .env
# edit DATABASE_URL in both if you changed the docker-compose port mapping

pnpm db:generate     # generate the Prisma client
pnpm db:migrate       # create + apply the initial migration (prompts for a migration name on schema changes)
pnpm db:seed          # demo organization/garage/staff/customer/vehicle
```

Seeded logins (see `packages/database/prisma/seed.ts`):
- `owner@legarage.dev` / `password123` (garage OWNER role, garage-web)
- `tech@legarage.dev` / `password123` (TECHNICIAN, garage-web)
- `driver@legarage.dev` / `password123` (vehicle owner, owner-mobile —
  pre-linked to the seeded vehicle, with one demo job already in
  `WAITING_APPROVAL` so there's something real to see on first login)

**Object storage (photo/document uploads):** the API creates its MinIO
bucket (`legarage-attachments` by default) automatically on startup if it
doesn't exist — no manual `mc mb` step needed for local dev. MinIO's
console is at `http://localhost:9001` (same `legarage`/`legarage123`
credentials as `docker-compose.yml`) if you want to browse uploaded
objects directly. See `apps/api/.env.example` for the `S3_*` variables —
`S3_ENDPOINT` must be reachable from both the API process and the
browser, since presigned URLs are generated server-side but PUT/GET
directly from the client.

**Realtime:** the API also serves a Socket.IO namespace at `/realtime` on
the same port as the REST API (no separate process or port) — nothing
extra to run.

## Building the shared packages

`apps/api` (and eventually `garage-web`/`owner-mobile`) consume
`@le-garage/database`, `@le-garage/types`, and `@le-garage/validation` from
their **built** `dist/` output, not raw TypeScript source — this is a
deliberate monorepo choice (see `DECISIONS.md` and the note below), not an
oversight.

```bash
pnpm --filter @le-garage/database build
pnpm --filter @le-garage/types build
pnpm --filter @le-garage/validation build
```

Or, while actively developing, run each in watch mode (`pnpm --filter
@le-garage/database dev`, etc.) so `dist/` stays current, or just run `pnpm
dev` at the root once `turbo.json`'s pipeline covers it end-to-end.

> **Why built dist, not raw source:** a package's `package.json#main`
> pointing straight at `src/index.ts` only works when every consumer goes
> through a TypeScript-aware loader (ts-node, tsx, a bundler). NestJS's
> plain `node dist/main.js` execution does not, and modern Node's native
> (unflagged) TypeScript handling of `.ts` files under plain `require()`
> applies strict ESM resolution rules that break extension-less relative
> imports — so an unbuilt workspace package fails at runtime with a
> confusing `ERR_MODULE_NOT_FOUND`. Building to `dist/` (with `.d.ts`
> output) sidesteps this entirely and matches how the packages will be
> consumed in production anyway.

## Running the API

```bash
pnpm --filter @le-garage/api dev     # nest start --watch
```

Listens on `http://localhost:4000/api/v1` (prefix is set in `main.ts`).
Health check: `GET /api/v1/health`.

If you change a shared package's schema/types and the API's dependency
resolution seems stuck on old behavior, delete `apps/api/dist` and
`apps/api/*.tsbuildinfo` — `nest start`'s incremental TypeScript build cache
can get confused by out-of-band edits to workspace dependencies.

## Running Garage Web

```bash
cp apps/garage-web/.env.local.example apps/garage-web/.env.local  # points at the local API
pnpm --filter @le-garage/garage-web dev
```

Listens on `http://localhost:3000`. Requires the API running (above) and
`@le-garage/types`/`@le-garage/validation` built (`pnpm --filter
@le-garage/types build && pnpm --filter @le-garage/validation build` —
see the "Why built dist, not raw source" note above; the same reasoning
applies here).

Sign in at `/login`, or set up a new garage at `/register` (this calls
`POST /organizations` — the same endpoint the seeded demo data bypasses).
The seeded demo login from "First-time setup" above
(`owner@legarage.dev` / `password123`) also works once the API is
running against the seeded database.

Design system: `apps/garage-web/tailwind.config.ts` (color/type/spacing
tokens) and `apps/garage-web/src/app/globals.css`. UI primitives live in
`src/components/ui`; don't reach for a component library's default
styling — extend the existing primitives so the app stays visually
consistent. See `docs/DECISIONS.md` ADR-0013 for the reasoning behind the
stack and design choices.

## Running Owner Mobile

```bash
pnpm --filter @le-garage/owner-mobile start   # Expo dev server — press i/a/w for iOS/Android/web
```

Requires the API running (above) and `@le-garage/types`/
`@le-garage/validation` built, same reasoning as Garage Web. The API URL
is read from `app.json`'s `extra.apiUrl` (defaults to
`http://localhost:4000/api/v1`); override per-run with
`EXPO_PUBLIC_API_URL` if needed (e.g. a physical device needs your
machine's real LAN IP, not `localhost` — see `src/lib/config.ts`, which
also handles the Android-emulator-specific `10.0.2.2` alias
automatically).

Sign in with the seeded demo owner login (`driver@legarage.dev` /
`password123`, pre-linked to the seeded vehicle) or register a new
account and use "Find my garage records" to link by phone — see
`OWNER-APP.md` §5.

**A note on this environment specifically:** `expo start`'s file watcher
can hit `ENOSPC: System limit for number of file watchers reached` on
Linux hosts with a low `fs.inotify.max_user_watches` (raising it needs
root). If that happens, use a one-shot static export instead of the
watching dev server — this is what was used to verify the app during
development:

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1 npx expo export -p web --output-dir dist-web
cd dist-web && python3 -m http.server 8081
```

This serves a real bundle of the actual app (same component tree Metro
would ship to iOS/Android), just without hot reload — rebuild after
each change. A proper static host would also need SPA-fallback routing
(any path → `index.html`) for direct navigation to work; `python3 -m
http.server` doesn't do this, so navigate from `/` via the app's own
links when testing this way rather than opening a deep link directly.

Design tokens: `src/theme/tokens.ts` — intentionally the same palette and
type scale as Garage Web's `tailwind.config.ts`, since React Native has
no shared-CSS mechanism between the two apps (`OWNER-APP.md` §11).

## Running tests

```bash
# Unit tests (pure logic — money math, job state machine)
pnpm --filter @le-garage/api test

# E2E/integration tests (spin up the full Nest app against the real DB —
# requires postgres running and migrated, see above)
pnpm --filter @le-garage/api test:e2e
```

`test/tenant-isolation.e2e-spec.ts` is the release-gate suite from
`SECURITY.md` §2 — it registers two organizations and asserts one can never
read/write the other's data. `test/job-lifecycle.e2e-spec.ts` walks the
full vertical slice through estimates/approvals; `test/job-execution.
e2e-spec.ts` continues through technicians/parts/labor/invoices/payments/
service history. `test/security-hardening.e2e-spec.ts` covers the
pilot-hardening pass specifically: concurrent job-status races,
`Idempotency-Key` protection, IDOR beyond the core suite, malformed input,
and — since it uploads a real oversized file straight to MinIO to prove
the size limit is enforced against actual bytes, not a client's claim —
**this suite needs MinIO running** (`docker compose up -d minio`,
already part of the standard local setup above). `test/
owner-app.e2e-spec.ts` covers the owner-mobile release gate: phone-
matched linking end to end, cross-owner isolation by id for vehicles/
jobs/estimates, staff-vs-owner token cross-use rejected in both
directions, and owner refresh-token rotation/reuse-detection.

## Manually exercising the API

```bash
BASE=http://localhost:4000/api/v1

# 1. Register a garage (creates Organization + Garage + OWNER user, returns tokens)
curl -s -X POST $BASE/organizations -H "Content-Type: application/json" -d '{
  "organizationName": "My Org",
  "garageName": "My Garage",
  "ownerFullName": "Jane Doe",
  "ownerEmail": "jane@example.com",
  "password": "password123"
}'

# 2. Use the returned accessToken as a bearer token for everything else:
curl -s $BASE/jobs -H "Authorization: Bearer <accessToken>"
```

See `docs/API.md` for the full route map.

## Database changes

Edit `packages/database/prisma/schema.prisma`, then:

```bash
pnpm db:migrate   # creates a new migration file and applies it locally
```

Update `docs/DATABASE.md` and `docs/DOMAIN.md` in the same change if the
change is conceptually significant (new entity, new relationship, changed
lifecycle) — they are the source of truth, not just commentary.

## Docker Compose reference

```bash
cd infrastructure/docker
docker compose up -d postgres redis minio   # infra only, run the API locally for fast iteration
docker compose up -d --build api             # also run the API in a container (see Dockerfile.api)
docker compose down                          # stop everything (add -v to also wipe volumes/data)
```

## Monorepo commands (from repo root)

```bash
pnpm build       # turbo run build — builds every app/package respecting dependency order
pnpm dev         # turbo run dev — runs every app/package's dev script concurrently
pnpm typecheck   # turbo run typecheck
pnpm lint        # turbo run lint
pnpm test        # turbo run test
```
