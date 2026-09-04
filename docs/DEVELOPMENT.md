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
- `owner@legarage.dev` / `password123` (OWNER)
- `tech@legarage.dev` / `password123` (TECHNICIAN)

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
full vertical slice this phase implements (intake → diagnosis → estimate →
send → approval → job APPROVED) and checks the state-machine guardrails and
estimate versioning behavior.

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
