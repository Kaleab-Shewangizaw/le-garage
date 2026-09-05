# Roadmap — Le Garage

## Phased build plan

Each phase should produce something usable, not just "compiles." Do not
advance a phase in this document until its milestone is actually working
end-to-end.

| Phase | Scope | Status |
|---|---|---|
| 0 | Repository, architecture, documentation | **Done** |
| 1 | Auth + organizations + garage setup | **Done** |
| 2 | Customers + vehicles | **Done** |
| 3 | Job cards + intake | **Done** |
| 4 | Diagnosis | **Done** |
| 5 | Estimates + approvals | **Done** |
| 6 | Technicians + job execution | **Done** — assignment, technician job list (`?mine=true`), append-only JobNote |
| 7 | Parts + labor | **Done** — job-scoped, locked once invoiced |
| 8 | Invoices + payments | **Done** — versioned invoices generated from actual parts/labor, payments with balance tracking |
| 9 | Service history | **Done** — auto-written on COLLECTED, job auto-closes |
| 10 | Owner app | Not started (deliberately after the pilot — brief §25) |
| 11 | Notifications | Not started |
| 12 | Hardening + testing + deployment | **Core pass done** — see below |
| — | Garage Web (`apps/garage-web`) | **Core loop + files/realtime/print/share done** — see below |

See `DEVELOPMENT.md` for how to run what currently exists, and each
milestone's implementation notes (communicated in-conversation at the time
of the change, and reflected here as phases complete).

### Garage Web status

Built and verified end-to-end in a real browser (not just typechecked):
auth (login/register), app shell (sidebar/topbar/mobile nav), Overview
(operational stat tiles + jobs-needing-attention list), Jobs board
(search/status tabs), the intake flow (`New job` — find-or-create
customer/vehicle in one panel), and the full Job Detail page (header with
the job-timeline signature element + status actions, Overview/Estimate/
Parts & Labor/Invoice & Payment/Activity tabs) covering diagnosis,
estimate creation → send → approval, technician assignment, parts/labor
recording, invoice generation/issue/void, and payment recording. Customers,
Vehicles (including service history), Team, and Settings pages are built
and connected to real data, lighter than Jobs/Job Detail by design (brief
§29 — prioritize workflows over exhaustive settings surface).

**Since then (pilot-hardening pass):** photo/document attachments (job
Overview tab, direct-to-storage upload), live job-board/detail updates via
Socket.IO (no manual refresh needed when another staff member changes a
job), a printable invoice (`/print/jobs/:id/invoice`), a customer estimate
share link (`/estimate/:token`, no login required), `Idempotency-Key`
duplicate-action protection on job creation and payment recording,
"recently used" customer/vehicle shortcuts in intake (free — the existing
search endpoints already return most-recent-first on an empty query), an
offline/connection-state banner, and two real mobile-layout bugs found and
fixed by an actual 375px-viewport audit (`UX.md` §6).

Not yet built: a dedicated admin web app; owner-mobile (Phase 10,
deliberately deferred).

## Phase 12: Hardening — what's done, what's tracked elsewhere

Security: tenant isolation extended and re-verified (IDOR across
diagnoses/notes/files, cross-org privilege-escalation attempts,
malformed-input rejection — `apps/api/test/security-hardening.e2e-spec.ts`),
an optimistic-concurrency fix for a genuine race in job status transitions
(`DECISIONS.md` ADR-0014, verified under real concurrent load), a real
gap found and closed in upload size enforcement (declared-vs-actual byte
count, `SECURITY.md` §7), failed-login and refresh-token-reuse audit
logging. Reliability: idempotency-key protection (ADR-0015). Observability:
`/health` now checks database connectivity, not just process liveness.
Backup/recovery: a real `pg_dump`/`pg_restore` drill into an isolated
container, verified (data, foreign keys, indexes all intact) — documented
in `DATABASE.md` §12; **not yet automated as a scheduled job** in any
environment, tracked there.

Still open for a later hardening pass (not blocking the pilot): scheduled/
automated nightly backups (currently a documented, tested, manual
procedure), `IdempotencyRecord` row expiry/sweep, broader rate limiting
beyond auth/files/public routes, structured request-ID tracing across log
lines. See `OPEN_QUESTIONS.md`.

## Post-MVP roadmap (Phase 2+ concepts — not built now)

Kept here so the data model and module boundaries don't accidentally
preclude them, per `ARCHITECTURE.md`'s modular-monolith rationale:

- Advanced garage inventory (standalone stock management beyond job-scoped
  parts)
- Appointments/scheduling
- Multi-branch garages (schema-ready via `Organization`/`Garage` split,
  `DOMAIN.md` §7)
- Fleet management (multi-vehicle owners with fleet-level views/reporting)
- Parts suppliers directory + parts marketplace
- Insurance workflows and claims integration
- Roadside assistance (won't-start, flat tire, overheating, accident, dead
  battery, out of fuel → location share → quote → ETA → provider tracking →
  destination garage selection)
- Towing
- Trusted garage network / discovery for owners without an existing garage
  relationship
- Maintenance reminders (mileage/time-based, generated from `ServiceRecord`
  history)
- Digital Vehicle Passport (portable, structured service history — the
  long-term evolution of `ServiceRecord`, `DOMAIN.md` §3/§8)
- Vehicle ownership transfer workflow
- Vehicle valuation
- EV-specific workflows
- Analytics and garage benchmarking
- Financing
- Insurance integrations

## Future flagship: Vehicle Assistant

An AI assistant specialized to an owner's specific vehicle — takes a
symptom description, asks useful follow-up questions, uses the vehicle's
actual service history, helps assess urgency/likely cause, and can
recommend a trusted garage or initiate a service request.

**Explicitly not built in MVP or immediately post-MVP.** Its value is
directly proportional to the volume of real vehicle/service history data in
the system — building it before that data exists produces a generic,
undifferentiated chatbot. It stays on the roadmap and the domain model
(`DOMAIN.md` §9 lists what's excluded, including this) does not block
adding it later, but no implementation work should happen on it until
Phase 9+ history data is flowing from real garages.

## Non-goals (not "later," just not this product)

Generic garage directory, "Uber for mechanics," a social network for car
owners, a full ERP, microservices/Kubernetes. See `PRODUCT.md` §8.
