# Le Garage

Working name only — subject to change. Not a brand yet, a platform.

An automotive services ecosystem starting in Addis Ababa, Ethiopia: a
**Garage OS** that runs a workshop's full job lifecycle (intake → diagnosis
→ estimate → approval → repair → invoice → payment → service history), and
an **owner app** that gives vehicle owners a trustworthy window into that
same data. See [`docs/PRODUCT.md`](./docs/PRODUCT.md) for the full product
vision.

## Start here

**[`docs/README.md`](./docs/README.md)** is the source of truth for this
project — product vision, architecture, domain model, database schema, API
conventions, security model, and roadmap. Read it before making product or
architectural decisions.

## Repository layout

```
apps/
  api/            NestJS modular monolith — the backend
  garage-web/     Next.js — garage staff web app (core loop built)
  owner-mobile/   React Native/Expo — vehicle owner app (Phase 10)
  admin-web/      Next.js — internal platform admin (not yet built)
packages/
  database/       Prisma schema + client (single source of truth for the DB shape)
  types/          Shared TypeScript types
  validation/     Shared Zod validation schemas
  config/         Shared tsconfig
infrastructure/
  docker/         docker-compose.yml + Dockerfiles for local/prod infra
docs/               product/architecture source of truth — read this first
```

## Quick start

See [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for full setup. Short version:

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis minio
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.example packages/database/.env
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm --filter @le-garage/api dev
```

Then `curl http://localhost:4000/api/v1/health`, or run `apps/garage-web`
too (see [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) §"Running Garage
Web") and sign in at `http://localhost:3000/login`.

## Current status

The full garage-side backend (Phases 0–9: auth, organizations/garages,
customers, vehicles, job cards/intake, diagnosis, estimates/approvals,
technician execution, parts/labor, invoices/payments, service history) is
implemented and tested end-to-end against a real Postgres instance.
`apps/garage-web` covers the same loop end-to-end in the browser — login,
intake, diagnosis, estimate, approval, repair, invoice, payment,
collection, and the resulting vehicle service history. See
[`docs/ROADMAP.md`](./docs/ROADMAP.md) for exactly what's built and what's
next (owner app, notifications, hardening).
