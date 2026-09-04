# Open Questions & Assumptions — Le Garage

Per brief §35: when information is missing, make a reasonable engineering
assumption, document it here, and keep moving rather than blocking on it.
Each entry: the question, the assumption made to unblock work, and what
would make us revisit it.

## Product

1. **Monetization/pricing model.** Not decided. Assumption: irrelevant to
   MVP engineering; no billing logic built yet. Revisit before first paying
   customer.
2. **Multi-branch garages.** Assumption: out of MVP scope; schema allows it
   via the `Organization`/`Garage` split (`DOMAIN.md` §7) but no UI/API
   supports more than one `Garage` per `Organization` yet. Revisit when a
   pilot garage actually operates multiple locations.
3. **Owner-to-existing-Customer linking.** Assumption: matched by phone
   number, surfaced for confirmation rather than silently auto-merged, when
   `owner-mobile` (Phase 10) is built. Revisit at Phase 10 design time — the
   right UX for "is this you?" isn't designed yet.
4. **Cross-garage vehicle identity.** Assumption: MVP scopes `Vehicle` to
   the `Organization` that first recorded it (`DATABASE.md` §4) — the same
   real car serviced at two different garages produces two `Vehicle` rows
   today. Full Vehicle Passport vision needs this resolved, but it's a
   trust/product decision (what can garage B see about a car's history at
   garage A?) as much as an engineering one. Revisit before building the
   Vehicle Passport (`ROADMAP.md`).

## Auth / roles

5. **Shared vs. individual technician logins.** Assumption: each technician
   authenticates individually (not a shared per-shift device login), for
   accountability (who recorded this diagnosis/status change matters for
   trust and audit). Revisit if pilot garages find individual logins
   impractical in practice.
6. **Technician visibility scope.** Assumption (stated, not yet hard-
   enforced at the service layer in the first implementation pass):
   technicians can read all open jobs at their garage (useful in a small
   shop where anyone might pick up any car) but the UI defaults to "my
   assigned jobs." Whether write access should be hard-restricted to
   assigned jobs only is unresolved — revisit based on pilot feedback
   before it matters for a real dispute.
7. **Technician pricing visibility.** Assumption: hidden by default
   (`AUTH.md` §3); no per-garage toggle built in MVP. Revisit if a pilot
   garage asks for it.
8. **Verbal/phone approval trust level.** Assumption: staff-logged verbal
   approvals are a first-class `ApprovalMethod` with a required note, since
   most customers won't have the owner app at pilot launch. This is
   weaker evidence than an in-app approval and should probably be
   surfaced as such in the UI (e.g. a visible "approved by phone, logged by
   [staff]" badge) — exact UI treatment not yet designed.

## Data model

9. **Plate change history.** Assumption: not a dedicated `PlateHistory`
   table in MVP; a plate change is a mutation on `Vehicle.licensePlate`
   captured only by the generic `AuditLog`. Revisit if plate-change
   tracking becomes a real product need (e.g. resale/passport features).
10. **Invoice correction model.** Assumption: `ISSUED` invoices are
    immutable; corrections create a new invoice linked via
    `supersedesInvoiceId` with the old one `VOID`ed (`DATABASE.md` §8).
    Not yet validated against real-world Ethiopian invoicing/tax norms —
    revisit if a pilot garage has specific compliance requirements here.
11. **No cross-validation between recorded parts/labor and the approved
    estimate scope.** Assumption: the API lets staff record any `JobPart`/
    `JobLabor` on a job regardless of what was actually approved
    (`DOMAIN.md` §3, ADR-0010) — the platform trusts the garage rather than
    trying to match free-text estimate line descriptions against part/labor
    entries, which would need real product-matching logic to do honestly.
    This means the invoice could, in principle, bill for something the
    customer never approved, with no system-level guardrail beyond staff
    judgment and the audit trail. Revisit if this becomes a real dispute
    vector in pilot usage — likely fix is a UI-level nudge (show approved
    scope alongside the parts/labor form) before anything more structural.
12. **Technician write access to parts/labor is not scoped to their own
    assigned job.** Any staff member (including a technician not assigned
    to a given job) can currently add parts/labor to it — matches
    `docs/OPEN_QUESTIONS.md` #6's existing "read access is broad, write
    restriction unresolved" stance, now extended to these two resources.
    Revisit together with #6.

## Infrastructure

11. **Postgres Row-Level-Security as a second tenant-isolation layer.**
    Assumption: not built in MVP; the Prisma middleware + guard + test
    suite (`SECURITY.md` §2) is the enforcement layer. Revisit before
    scaling past a handful of pilot tenants.
12. **Managed identity provider vs. custom auth.** Assumption: custom
    (`DECISIONS.md` ADR-0007). Revisit when owner-mobile needs
    consumer-scale auth or a garage customer requires SSO.

Add new entries here rather than leaving an assumption undocumented
in code or chat.
