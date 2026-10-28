# Le Garage — Documentation

**Le Garage** (working name — subject to change) is an automotive services ecosystem
starting in Addis Ababa, Ethiopia. This `/docs` directory is the **source of truth**
for the product. Code implements what is written here; when a real decision changes,
update the relevant doc in the same change, not after.

## Reading order (first time)

1. [PRODUCT.md](./PRODUCT.md) — vision, users, workflows, MVP scope, principles
2. [DOMAIN.md](./DOMAIN.md) — entities, relationships, lifecycle, state machines
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — system architecture, monorepo layout, tech stack
4. [DATABASE.md](./DATABASE.md) — schema design, conventions, indexing, money/versioning rules, backup/recovery
5. [API.md](./API.md) — API conventions, module map, endpoint index
6. [AUTH.md](./AUTH.md) — authentication & authorization model
7. [SECURITY.md](./SECURITY.md) — threat model and controls
8. [UX.md](./UX.md) — interaction principles for garage staff vs. vehicle owners
9. [MVP.md](./MVP.md) — exact MVP scope and definition of done
10. [ROADMAP.md](./ROADMAP.md) — phased build plan and post-MVP roadmap
11. [DECISIONS.md](./DECISIONS.md) — architecture decision records (ADRs)
12. [DEVELOPMENT.md](./DEVELOPMENT.md) — how to run, build, test the project locally
13. [ETHIOPIA.md](./ETHIOPIA.md) — market-specific constraints and design accommodations
14. [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) — unresolved questions and assumptions made to unblock work
15. [PILOT.md](./PILOT.md) — how Le Garage gets tested with real garages
16. [PILOT-FEEDBACK.md](./PILOT-FEEDBACK.md) — the running log from pilot sessions
17. [OWNER-APP.md](./OWNER-APP.md) — the vehicle-owner mobile app: design, auth, linking, approval flow

## How to use this documentation

- **Product/business questions** → `PRODUCT.md`, `ROADMAP.md`
- **"What entity owns this data / what's the lifecycle?"** → `DOMAIN.md`
- **"Where does this live in the codebase?"** → `ARCHITECTURE.md`
- **"What's the schema / how is money stored?"** → `DATABASE.md`
- **"What can a technician vs. owner vs. admin do?"** → `AUTH.md`, `SECURITY.md`
- **"Why did we choose X over Y?"** → `DECISIONS.md` (add a new ADR instead of re-litigating in chat)
- **"Is this in MVP?"** → `MVP.md`
- **"How do we test this with real garages?"** → `PILOT.md`, `PILOT-FEEDBACK.md`
- **"Something is unclear and blocking me"** → check `OPEN_QUESTIONS.md` first, then add to it if still unresolved

## Status

The full garage-side backend (Phases 0–9) and `apps/garage-web` cover the
complete garage workflow end-to-end — intake through service history —
verified against a real database and a real browser, not mocks. A
pilot-readiness hardening pass (security audit, file uploads, realtime
updates, financial/concurrency correctness, mobile UX audit, a customer
estimate share link, backup/recovery drill) is complete.

Phase 10, the owner app (`apps/owner-mobile`), is now also built — ahead
of the pilot, on explicit direction, not the after-pilot sequencing
originally planned (`MVP.md` §4 explains the tradeoff). It covers
registration, phone-matched linking to garage records, vehicles, active
repairs with a plain-language progress timeline, itemized estimate
review and per-item approve/reject, service history, and an in-app
notification foundation. See `OWNER-APP.md` for the full design and what
it deliberately excludes.

The actual pilot with 3–5 real garages (`PILOT.md`) has not run yet —
that remains the next real validation step for the whole product, garage
side and owner side both.
