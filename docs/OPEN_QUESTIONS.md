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
3. **Owner-to-existing-Customer linking.** **Resolved** — `CustomerLink`
   matches by phone number, surfaced for confirmation via
   `GET /owner/customer-matches` (not auto-merged), and the confirm step
   (`POST /owner/customer-links`) re-verifies the phone match
   server-side. See `OWNER-APP.md` §5 and `DECISIONS.md` ADR-0020. A
   garage-initiated invitation link remains a possible future addition —
   see #22 below — if the self-serve phone-match flow doesn't work for
   some real garage's customers.
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

13. **Postgres Row-Level-Security as a second tenant-isolation layer.**
    Assumption: not built in MVP; the Prisma Client Extension + test
    suite (`SECURITY.md` §2) is the enforcement layer. Revisit before
    scaling past a handful of pilot tenants.
14. **Managed identity provider vs. custom auth.** Assumption: custom
    (`DECISIONS.md` ADR-0007). Revisit when owner-mobile needs
    consumer-scale auth or a garage customer requires SSO.
15. **`IdempotencyRecord` rows are never swept.** Assumption: fine at
    pilot volume (a handful of garages, a few hundred protected mutations
    a day at most) — the table just grows. Revisit with a scheduled
    cleanup (delete rows past some age, e.g. 7 days) before real
    production volume; not needed for the pilot itself.
16. **Nightly database backups are documented and tested, not yet
    automated.** `DATABASE.md` §12 has a verified `pg_dump`/`pg_restore`
    procedure (actually exercised: dumped, restored into an isolated
    container, data/foreign-keys/indexes confirmed intact), but no cron
    job or scheduled task runs it anywhere yet. Acceptable for a pilot
    running on a dev/staging host with manual oversight; not acceptable
    once a garage's real, only copy of their business records depends on
    it — must be automated before that's true.
17. **Estimate share-link views aren't tracked.** `Estimate.shareToken`
    exists and the public page works, but there's no record of whether a
    customer actually opened the link (`PILOT.md` §5 metrics table).
    Deliberately not built yet — a view-count needs its own thought about
    what "viewed" should mean (unique visitor? every load?) and isn't
    needed to ship the feature; add it if the pilot shows this metric
    actually matters for a real decision.
18. **Rate limiting doesn't cover every mutation route.** Applied to
    login/refresh (`AUTH.md` §5), file presign, and public estimate
    reads (`API.md` §"public") — matching `SECURITY.md` §10's stated
    "targeted, not blanket" approach. Revisit if pilot usage (or abuse)
    shows a different route needs it; don't add it speculatively
    everywhere first.
19. **Photo attachments have no thumbnail — the job-detail photo grid
    downloads full-resolution images to render small tiles.** Assumption
    (`DECISIONS.md` ADR-0019): not worth building an image-processing/
    thumbnail pipeline before knowing real pilot photo volume; a real
    but small waste of mobile bandwidth at today's scale (a handful of
    photos per job). Revisit — likely via `sharp` on upload, storing a
    second small object per photo — if pilot usage shows photo-heavy
    jobs (e.g. many high-res damage photos) making this a real
    complaint, not a theoretical one. The related per-attachment presign
    fanout (one `/files/:id/url` call per visible photo, not batched)
    has the same "real but small, not worth new API surface yet"
    status.

## Owner app (Phase 10)

20. **Real push notification delivery doesn't exist.** `Notification`
    rows are written (`OWNER-APP.md` §9) but every one is `IN_APP`/`SENT`
    — there's no device-token registration and nothing calls an actual
    push service (Expo's or otherwise). The owner app polls
    `GET /owner/notifications` instead. Revisit once there's a real
    reason to know delivery happened even when the app isn't open (e.g.
    pilot feedback that owners miss time-sensitive updates like "ready
    for pickup").
21. **The Vehicles-tab list can show a briefly stale status badge.**
    `GET /owner/vehicles` deliberately omits per-vehicle estimate data to
    keep that list payload light (brief §26), so for the few minutes
    between an owner approving an estimate and staff transitioning the
    job status, the list badge can still read "Waiting for approval"
    even though job detail and Home already show the correct state
    (`resolveDisplayStatus`, `OWNER-APP.md` §7). Revisit if pilot usage
    shows this is actually confusing rather than just briefly imprecise.
22. **No garage-initiated invitation link exists yet** as an alternative
    to owner self-registration + phone-matched linking
    (`OWNER-APP.md` §5). The self-serve flow is the simplest one that
    works with the existing backend (brief §16) and is what's built;
    an invitation link (garage sends a secure link, owner taps to link
    without needing to already know their own phone matches) is a
    reasonable addition if a pilot garage's customers struggle to
    self-link. Not built speculatively ahead of that evidence.
23. **Password-based auth, not the originally-scoped phone+OTP**
    (`MVP.md` §2). OTP needs an SMS provider integration not justified
    to stand up for this pass; password auth reuses the exact same
    argon2/`User` infrastructure the staff side already has running.
    Revisit if pilot feedback shows owners specifically expect/prefer
    OTP over remembering a password.
24. **`CustomerLink` rows are never removed** — there's no "unlink this
    garage" action once confirmed, matching how there's also no
    "disconnect a staff member's own account" flow on the garage side.
    Low risk (a link only grants read/approve access to that owner's own
    linked customer, never anyone else's), but worth a real UI affordance
    if a pilot owner ever links the wrong record by mistake and needs to
    undo it themselves rather than asking for manual intervention.

Add new entries here rather than leaving an assumption undocumented
in code or chat.
