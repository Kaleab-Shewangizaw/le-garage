# MVP Scope — Le Garage

## 1. Definition of done for the MVP

A real garage can, using the product:

**Garage side:** receive a vehicle → create/find the customer → create/find
the vehicle → create a job → record the complaint → capture intake photos →
diagnose the vehicle → create an estimate → send it to the owner → receive
approval → perform work → record parts/labor → generate an invoice → record
payment → mark the vehicle ready → preserve the service history.

**Owner side:** see their vehicle → see the current repair → understand
what the garage found → see the estimate → approve work → see progress →
see the final result → retain the service history.

This exact checklist (brief §38) is the acceptance test for "MVP works,"
not a specific sprint's ticket list.

## 2. In scope

### Garage (`apps/api` + `apps/garage-web`)
- Authentication (staff login, JWT access/refresh)
- Garage profile (single garage per organization)
- Staff/users (invite, role assignment: OWNER/MANAGER/FRONT_DESK/TECHNICIAN)
- Customer management (create/find/search, dedupe by phone)
- Vehicle management (create/find/search, dedupe by plate/VIN,
  `DOMAIN.md` §4)
- Job cards + intake flow
- Photo/attachment capture on job/diagnosis
- Diagnosis recording
- Estimates (versioned) + estimate items
- Customer approval recording (in-app for app users; staff-logged
  verbal/phone approval otherwise, `AUTH.md` §"Approval")
- Parts on jobs (job-scoped, not standalone inventory)
- Labor on jobs
- Job status/state machine (`DOMAIN.md` §5), technician assignment
- Invoice generation from approved scope + actuals
- Payment recording (cash, Telebirr, bank transfer)
- Service history (`ServiceRecord` on job completion)
- Basic operational dashboard (what's happening right now)

### Owner (`apps/owner-mobile`) — Phase 10, scoped now, built after garage side is proven
- Authentication (phone + OTP)
- My vehicles
- Vehicle details
- Current job + repair timeline
- Diagnosis view
- Estimate view + approve/reject (incl. per-item)
- Parts/work performed view
- Invoice + payment status view
- Service history
- Garage information

### Admin (`apps/admin-web`) — built alongside hardening, not before garage+owner core works
- Users
- Garages
- Vehicles
- Jobs
- Basic platform monitoring
- Basic moderation
- Platform configuration

## 3. Explicitly out of scope for MVP

See `PRODUCT.md` §8 and `ROADMAP.md` for the full non-MVP list and where
each item sits long-term. Restated briefly: AI diagnosis/Vehicle Assistant,
full parts marketplace/standalone inventory, roadside assistance/towing,
multi-branch garages, appointments/scheduling, insurance/claims, fleet
management, advanced analytics/benchmarking, complex payment processing
beyond recording, social/rating features, offline-everything mobile.

## 4. Implementation order

Matches `ROADMAP.md` phases. Backend Phases 0–9 are complete: repo/docs/
architecture → auth + organizations + garage setup → customers + vehicles
→ job cards + intake → diagnosis → estimates + approvals → technicians +
job execution → parts + labor → invoices + payments → service history. The
full garage-side loop in §1 above (intake through service history) works
end-to-end against a real database, covered by `apps/api/test/
job-lifecycle.e2e-spec.ts` and `job-execution.e2e-spec.ts`.

`apps/garage-web` now covers the full garage-side loop in §1 above
end-to-end in the browser — login → overview → new job (intake) →
diagnosis → estimate → send → approval → technician assignment → parts/
labor → invoice → payment → collect → vehicle service history — verified
against the real API, not mocked data. See `ROADMAP.md` §"Garage Web
status" for exactly what's built. Next: Phase 10 (owner app), or hardening
the garage-web surface (file uploads, realtime board updates) — see
`OPEN_QUESTIONS.md` for the tradeoffs on each.

## 5. Assumptions made to keep the MVP unblocked

Full list in `OPEN_QUESTIONS.md`. Highlighted here because they shape scope
directly:
- Single garage per organization (no multi-branch) — schema allows it
  later, UI/API doesn't build it now.
- Technicians authenticate individually (not shared device logins) —
  revisit if pilot garages push back.
- Verbal/phone approvals are staff-logged with a required note, since not
  every customer will have the owner app at pilot launch.
