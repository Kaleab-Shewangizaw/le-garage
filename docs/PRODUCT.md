# Product Requirements — Le Garage

Working name only. No time will be spent on branding, naming, or visual identity
until the product itself works.

## 1. Vision

Build the operating system for automotive workshops, and use the data those
workshops generate to build the best possible digital experience for vehicle
owners.

> Whenever something happens with my car, I open Le Garage.

Long-term aspiration: the product feels like **"your car's home."**

## 2. The problem

In Addis Ababa (and most of Ethiopia), vehicle service today is largely:

- paper tickets, notebooks, or nothing at all
- WhatsApp/Telegram threads and phone calls as the "system of record"
- no durable, structured service history tied to a vehicle
- verbal estimates with no audit trail, which breeds disputes over "we never
  agreed to that" or "you never told us this would cost that much"
- parts of unknown provenance/quality, no structured record of what was
  actually installed
- no way for an owner to prove maintenance history when selling a vehicle or
  filing an insurance claim

This is a trust and record-keeping problem as much as a workflow problem.

## 3. The core business loop (the flywheel)

```
Garage uses Le Garage → vehicle enters system → job created → diagnosis
recorded → estimate created → owner approves → parts/labor recorded → repair
completed → payment recorded → service history stored permanently → owner
gets a useful vehicle record → owner trusts platform → owner returns for
future service → more garages want the system → more vehicles/jobs enter
the network → better vehicle data → additional services become possible
```

The **garage software (Garage OS) is the data-generation engine.** The
**owner app is the consumer-facing window** into that data. They are one
product with two faces, not two separate products. Every entity in the data
model (see `DOMAIN.md`) is designed so a garage-side action becomes an
owner-side fact automatically — there is no separate "publish to owner"
step.

## 4. Target market

Initial geography: **Addis Ababa, Ethiopia.** See `ETHIOPIA.md` for the full
list of market-specific constraints (connectivity, payment methods, language,
device tier, informal workshops, etc.) and how the architecture accommodates
them without over-building for them on day one.

## 5. Users & personas

### A. Garage Owner / Manager
Runs the business. Needs visibility into what's happening across all jobs,
staff, money owed, and money collected. Primary device: shared tablet or
desktop at the front desk, sometimes phone.

**Hypothesis:** most garage owners in the initial target segment are
technically comfortable with WhatsApp/Telegram and basic spreadsheets but
have not used purpose-built business software before. UI must not assume
prior SaaS literacy.

### B. Technician / Mechanic
Works on vehicles. Needs a fast, low-friction way to see assigned jobs,
record diagnosis/work/parts, and change job status. Should not see
pricing/financial data unless the garage chooses to expose it (role-gated).
Primary device: phone, often shared between technicians, often with a
cracked screen and a mediocre data connection.

### C. Vehicle Owner
Owns/drives a car serviced by a Le Garage-enabled garage. Wants to know
what's wrong, what it costs, whether to approve it, and to keep a record.
Primary device: personal Android phone, sometimes an unreliable connection.

**Hypothesis:** owner trust is won by transparency (photos, itemized
estimates, explicit approval) more than by price. Not validated with real
users yet — treat as a hypothesis to test, not a fact.

### D. Platform Admin (internal)
Le Garage staff operating the platform: onboarding garages, monitoring
health, handling disputes/moderation, configuring platform-level settings.

## 6. Core workflow

The full 12-step garage workflow (intake → diagnosis → estimate → approval
→ assignment → parts → repair → QC → invoice → payment → release →
aftercare) is specified in detail in `DOMAIN.md` §Job Lifecycle and enforced
as a state machine in the API (`ARCHITECTURE.md`, `DATABASE.md`). It is not
repeated here to avoid two sources of truth drifting apart.

The single most important product idea: **the Job Card is the spine.**
Everything (diagnosis, estimate, approval, parts, labor, invoice, payment,
warranty, service history) hangs off a job card. The product is not a set
of disconnected CRUD modules for customers/vehicles/invoices — it is one
lifecycle with a job card at its center.

## 7. Product principles

1. **Faster than paper, or it won't be used.** Every common garage action
   (especially intake) must be faster than the notebook it replaces. See
   `UX.md`.
2. **The job card is the spine.** No feature is designed as a disconnected
   module; everything relates back to a job's lifecycle.
3. **Structured trust over star ratings.** Trust comes from an evidence
   trail — diagnosis, photos, itemized estimates, documented approvals — not
   a 5-star rating widget. See `SECURITY.md`/`DOMAIN.md` §Trust.
4. **Vehicle identity outlives plates and owners.** A vehicle is a durable
   entity (VIN-anchored where possible) that can survive a plate change or
   ownership change. See `DOMAIN.md` §Vehicle Identity.
5. **Money is never approximate.** No floating point for currency, ever.
   See `DATABASE.md` §Money.
6. **Simple now, powerful later.** The MVP is deliberately narrow (see
   `MVP.md`). The data model and module boundaries are deliberately built to
   not block the roadmap in `ROADMAP.md`.
7. **Multi-tenant from day one.** A garage must never be able to see another
   garage's data. This is not a "later" feature — it is load-bearing from
   the first migration. See `SECURITY.md`.
8. **Every important action is auditable.** Estimate changes, approvals,
   status transitions, and payments write an audit trail. See `SECURITY.md`.

## 8. What we are deliberately NOT building (yet)

A generic garage directory, "Uber for mechanics," an AI mechanic chatbot, a
full parts marketplace, a towing-only business, a social network for car
owners, a giant ERP, or a microservices architecture. See `ROADMAP.md` for
where these sit (mostly Phase 2+ or explicitly "future flagship").

## 9. Business model — hypotheses (not validated)

These are **hypotheses**, not facts. None are load-bearing for the MVP; they
exist so the data model doesn't accidentally preclude them.

- **Hypothesis:** garages pay a monthly SaaS subscription (per-seat or
  per-job-volume) for Garage OS.
- **Hypothesis:** the owner app is free to vehicle owners; monetization is
  entirely garage-side initially.
- **Hypothesis:** roadside assistance, towing, and a trusted-garage network
  (Phase 2+) introduce a transaction/lead-gen revenue stream.
- **Hypothesis:** the long-term Vehicle Passport (structured, portable
  service history) has standalone value at point of vehicle resale/insurance
  and could support a data/verification product later.
- **Not decided:** pricing, free tier shape, take-rate on any marketplace
  activity. Do not build billing logic around unvalidated numbers.

## 10. Trust model

See `DOMAIN.md` §Trust and Approvals for the mechanics. Product summary:
trust is built from **documented, timestamped, attributable evidence** —
diagnosis notes, photos, itemized estimates, explicit customer approvals
(with an immutable audit trail of what was approved and when), warranty
records, and comeback/dispute history — not from subjective ratings alone.

**Implemented pilot-scale version:** a garage can attach photos (intake
condition, damage, completed work) to a job, and share a read-only,
no-login-required link to any sent estimate — the customer sees the exact
itemized breakdown staff see, on their own phone, over whatever channel
they already use (WhatsApp/Telegram/SMS, `ETHIOPIA.md` §3). Staff-logged
approval (verbal/phone, `AUTH.md` §7) remains the fallback for customers
without an owner account — but the Owner App (Phase 10, `OWNER-APP.md`)
is now built, and an owner who links their account to their garage's
customer record approves directly, in-app, which the system records as
`decidedByCustomerId` on the approval — stronger evidence than a
staff-logged verbal approval, since there's no intermediary. Both paths
coexist; which one applies to a given customer depends only on whether
they've linked an owner account yet.

## 11. Roadside assistance & Vehicle Assistant

Both are real, important, **future** features. Specified at a product level
in `ROADMAP.md` so the data model doesn't block them, but neither is built
in MVP. The Vehicle Assistant in particular depends on having real service
history data to be useful at all — building it before the data exists would
produce a generic chatbot with no differentiation.

## 12. Success metrics for the first version

Qualitative, not growth-metric-driven, because the first goal is proving the
loop works end-to-end for one real garage. See `MVP.md` §Success Criteria
for the exact numbered checklist (garage side and owner side). Once that
loop is proven with pilot garages, later phases should define quantitative
metrics (activation, job throughput per garage, approval turnaround time,
repeat-visit rate) — **not defined yet; do not fabricate targets.**

## 13. Open questions

See `OPEN_QUESTIONS.md`. Anything below is an explicit assumption made to
keep moving, not a settled product decision:
- Exact monetization/pricing model
- Whether technicians get individual logins or share a device login per shift
- Whether the owner app requires a phone number or allows email-only signup
- How multi-branch garages are represented (deferred post-MVP; single
  `Garage` per tenant for now, see `DOMAIN.md`)
