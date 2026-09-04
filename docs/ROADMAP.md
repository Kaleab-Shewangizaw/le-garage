# Roadmap — Le Garage

## Phased build plan

Each phase should produce something usable, not just "compiles." Do not
advance a phase in this document until its milestone is actually working
end-to-end.

| Phase | Scope | Status |
|---|---|---|
| 0 | Repository, architecture, documentation | **In progress** |
| 1 | Auth + organizations + garage setup | **In progress** |
| 2 | Customers + vehicles | **In progress** |
| 3 | Job cards + intake | **In progress** |
| 4 | Diagnosis | **In progress** |
| 5 | Estimates + approvals | **In progress** |
| 6 | Technicians + job execution | Not started |
| 7 | Parts + labor | Not started |
| 8 | Invoices + payments | Not started |
| 9 | Service history | Not started |
| 10 | Owner app | Not started |
| 11 | Notifications | Not started |
| 12 | Hardening + testing + deployment | Not started |

See `DEVELOPMENT.md` for how to run what currently exists, and each
milestone's implementation notes (communicated in-conversation at the time
of the change, and reflected here as phases complete).

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
