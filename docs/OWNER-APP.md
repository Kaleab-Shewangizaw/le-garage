# Owner App — Le Garage

This document covers `apps/owner-mobile`, the vehicle-owner-facing mobile
application. See `PRODUCT.md` for the overall vision, `DOMAIN.md` for the
entities it reads, and `ROADMAP.md` for how this phase (Phase 10) fits
into the larger plan.

## 1. What this is, and what it deliberately isn't

The garage side of Le Garage (`apps/api` + `apps/garage-web`) generates
the data: a vehicle passes through intake, diagnosis, estimate, approval,
repair, and invoice. The owner app makes that data useful to the person
who actually owns the car.

The emotional target (brief §32):

> "I know what is happening to my car." Not "your car needs some work,
> it'll cost around 8,000" — but "here's what we found, here's what we
> recommend, here's what it costs, here's what you're approving, here's
> what's been done, here's the permanent record."

**First release scope is deliberately narrow.** It answers three
questions and nothing else (brief §35):

1. What cars do I have?
2. What's happening with my car right now?
3. What happened to my car previously?

Everything in §17 of the build brief — an AI assistant, a garage
marketplace, roadside/towing, parts marketplace, insurance, fleet
management, valuation, social features, predictive maintenance — is
explicitly out of scope for this release. Some of these have a visible
but disabled entry point (e.g. "My car won't move" on the Profile screen,
labeled "Coming soon") so the *shape* of the future product is visible
without pretending the functionality exists.

## 2. Owner personas

Not formally segmented (this is a small first release, not a market-
research exercise), but the design is written for:

- **The daily-driver owner** — one or two personal vehicles, occasional
  garage visits, wants to avoid surprise costs and unnecessary trips to
  ask "is it ready yet?"
- **The busy owner who delegates the drop-off** — a family member or
  driver brings the car in; the owner still wants to see and approve the
  estimate remotely, which is the actual driver behind the "who gets
  linked to this vehicle" design in §6.

Both personas are explicitly *not* mechanics: the app translates every
piece of garage-internal language before it reaches the screen (§4).

## 3. Information architecture

Four tabs (brief §20 — "do not create 8-10 bottom tabs"):

- **Home** — what's happening right now, prominently, plus quick access
  to everything else
- **Vehicles** — the owner's cars, one profile per car
- **History** — every completed service record, across all vehicles,
  newest first, expandable
- **Profile** — identity, linked garage records, sign-out, and the
  "coming soon" emergency entry point

Screens reached by navigation rather than a tab (pushed on top of the
tabs): vehicle detail, job/repair detail, estimate review, notifications,
and the post-registration "find my garage records" flow.

## 4. Authentication — a second, independent track

A vehicle owner is not a garage staff member, and the existing `/auth`
surface hard-requires an active `StaffMember` row (`AuthService.login`
throws `NO_ACTIVE_STAFF_MEMBERSHIP` otherwise) — so owner-mobile does not,
and could not, reuse it directly. Rather than bolt owner support onto the
staff auth flow, it is a **second, fully independent authentication
track** under `/owner/auth/*`, sharing only the underlying `User` table,
password hashing (argon2), and refresh-token rotation machinery
(`TokenService`). See `DECISIONS.md` ADR-0020 for the full reasoning;
summarized:

- `RefreshToken.kind` (`STAFF` | `OWNER`) records which track a session
  belongs to, since **the same person can be both** — a mechanic who also
  owns a personal car serviced elsewhere should be able to use both apps
  with one account. Kind is a property of the *session*, not the user.
- Owner access tokens are signed with `JWT_OWNER_ACCESS_SECRET`, a
  different secret than staff's `JWT_ACCESS_SECRET`. A staff token
  presented to an owner route fails signature verification outright, and
  vice versa — the two cannot be confused even by a guard bug, not just
  by convention. Verified directly in `test/owner-app.e2e-spec.ts`.
- `OwnerJwtAuthGuard` (mirrors the staff `JwtAuthGuard`) is applied
  per-route on `@Public()`-marked controllers, exactly like the existing
  public-estimate-share pattern from the pilot-hardening pass — never as
  a second global guard.

Registration (`POST /owner/auth/register`) only fails if the phone/email
is already an account (any account — staff or owner); the fix there is
"log in," not "create a second identity."

## 5. Owner/garage relationship — how a vehicle enters the app

This was the actual open design question (`OPEN_QUESTIONS.md` #3, now
resolved) — a `Customer` row is garage-owned data that predates any owner
account, so *something* has to connect an owner's login to it.

**Decision: matched by phone number, confirmed explicitly, never
auto-merged.**

1. An owner registers with their own phone number (the same one their
   garage already has on file — the app tells them this directly, since
   it's the actual mechanism, not a coincidence).
2. `GET /owner/customer-matches` looks for `Customer` rows, across *any*
   organization, whose phone matches the owner's own `User.phone`
   (unscoped by design — an owner has no single tenant).
3. Nothing is linked automatically. The owner sees "we found you at
   [Garage Name] — is this you?" and taps to confirm.
4. `POST /owner/customer-links` creates a `CustomerLink` row (`User` ↔
   `Customer`, plus the organizationId for indexing) — and **re-verifies
   the phone match server-side** before creating it, so a link can't be
   forced by guessing a `customerId`.

`CustomerLink` is deliberately its own join table, not a `userId` column
on `Customer`: an owner can accumulate links across multiple garages (the
same real person, several `Customer` rows, one per organization — see
`OPEN_QUESTIONS.md` #4 on cross-garage vehicle identity, still open), and
linking must stay an explicit, auditable action.

**What this means for the demo flow (brief §31):** garage creates a job
for a customer with phone X → owner registers with phone X → owner
confirms the match → owner now sees that vehicle and its jobs. No new
"invite" mechanism was built for this release — matching brief §16's
instruction to "choose the simplest secure flow that works with the
existing backend." A garage-initiated invitation link is a reasonable
future addition if pilot usage shows owners struggling to find their own
records; not built until that's demonstrated.

## 6. What an owner can see — and the access-control chokepoint

Every owner-facing read or write goes through `OwnerAccessService`
(`apps/api/src/owner/owner-access.service.ts`) before touching any data:
it resolves the owner's *confirmed* `CustomerLink` rows and checks the
requested vehicle/job/estimate against them. A mismatch is a 404, never a
403 — same convention as the staff tenant-isolation suite, so a probing
request can't learn whether a resource merely isn't theirs versus doesn't
exist at all.

This is deliberately the **one** place in the codebase allowed to use
`prisma.unscopedClient` for reads that span multiple organizations — an
owner's own data legitimately lives across tenants, which is the one
legitimate exception to `SECURITY.md` §2's tenant-scoping rule. No other
owner-side code path uses the scoped client (there is no single
organizationId to scope by in an owner's session), and no staff-side code
should ever adopt this pattern.

**Deliberately excluded from owner-facing responses:** `JobPart.unitCost`
and `.supplier` — the garage's internal cost and sourcing, i.e. its
margin. "What it costs" comes from `EstimateItem`/`InvoiceItem`, which
only ever carry the customer-facing `unitPrice`/`lineTotal`. This is not
an oversight; owner-facing job reads skip the raw `JobPart`/`JobLabor`
tables entirely (`OwnerJobsService.getById`).

Verified directly, not just by inspection: `test/owner-app.e2e-spec.ts`
registers two independent owners and asserts owner B gets 404 on owner
A's vehicle, job, and estimate by id — not just an empty list.

## 7. Plain-language translation

`src/lib/job-copy.ts` in owner-mobile is the single place garage-internal
enums become what an owner reads. No screen reads `job.status` directly
for display — every one goes through `statusHeadline`/`statusDescription`
first. Examples:

| Internal | Owner sees |
|---|---|
| `WAITING_APPROVAL` | "Your approval is needed" |
| `DIAGNOSING` | "Being diagnosed" |
| `QUALITY_CHECK` | "Final check" |
| `READY` | "Ready for pickup" |

**A real bug this caught during testing:** an owner's own approval
decision on an estimate can land before garage staff transitions the
job's own status forward (approving an estimate and starting the repair
are two separate, staff-controlled actions in `DOMAIN.md` §5's state
machine) — so a naive read of `job.status` kept showing "Your approval is
needed" immediately *after* the owner had just approved it. Fixed via
`resolveDisplayStatus()`, which every status-displaying surface (home
card, job detail, progress timeline) now goes through instead of the raw
status. The Vehicles-tab list badge is a known, accepted exception — its
list endpoint deliberately doesn't carry per-vehicle estimate data to
keep that payload light (brief §26), so it can show this same staleness
for the few minutes between an owner's decision and staff picking it up.
Not worth a heavier list response for; revisit if pilot usage shows it's
actually confusing in practice.

## 8. The approval flow

The single most important screen in the app (brief §10-11). It reuses
`ApprovalsService.create` **verbatim** — the same transaction that
records staff-logged approvals in garage-web — rather than a parallel
implementation, with two owner-specific differences: `method` is always
`IN_APP` (never asked, since the owner deciding in-app is what's
happening), and `decidedByCustomerId` is now threaded through and set to
the *verified* linked customer. This is the strongest approval evidence
the system records — stronger than a staff-logged verbal approval,
because there is no intermediary.

Per-item approve/reject is real, not cosmetic: it's the same
`itemDecisions` array the backend has always accepted. Every item
defaults to "Approve" (the common case), with an explicit "Reject" toggle
per line and a "Reject all" shortcut. "Ask the garage" opens a phone call
to the garage's own number (`Linking.openURL('tel:...')`) — real
functionality using real data, not a placeholder, since the garage's
phone number is already part of every job's response.

After a decision, the estimate section shows the outcome and — per brief
§11 — an explicit sentence: "The garage can now proceed with this work."

## 9. Notifications — a real but deliberately minimal foundation

`NotificationsService` (`apps/api/src/notifications/`) piggybacks on
`AuditService.record` the same way realtime updates do
(`DECISIONS.md` ADR-0016): job-relevant actions (checked in, diagnosis
added, estimate sent, status reaching `IN_PROGRESS`/`READY`, payment
recorded) create a `Notification` row for every `User` linked to that
job's customer. The owner app polls `GET /owner/notifications` and shows
an unread badge.

**What is not built:** actual push delivery. There is no device-token
registration and nothing calls a real push service (Expo's or otherwise)
— every row is written `channel: IN_APP, status: SENT` regardless of the
schema's `PUSH` option existing for later. This is the brief's own
instruction (§14: "do not build an entire notification platform if the
backend isn't ready") applied literally. See `OPEN_QUESTIONS.md` for what
real push delivery would need.

## 10. Vehicles and service history

"My Vehicles" (brief §7) shows every vehicle the owner currently owns
(`VehicleOwnerHistory` with `endedAt: null`, scoped to their linked
customers) with its active job summarized inline. Vehicle detail (§8)
shows identity, current repair (if any), and the full service history —
sourced from `ServiceRecord.summary`, the same rich JSON snapshot
(diagnosis, parts, labor, cost, warranty) written once when a job is
collected (`DATABASE.md` §9), never reconstructed live from job tables.
Nothing on this screen is invented — an empty service history shows an
honest empty state, not placeholder rows.

**A real, pre-existing gap fixed along the way:** intake creating a new
vehicle never recorded who owned it (`VehicleOwnerHistory` was never
populated by the normal garage-web intake flow — see `DECISIONS.md`
ADR-0020's note on `jobs.service.ts`), which would have made "my
vehicles" return nothing for almost every real vehicle in the system.
Fixed at the source rather than worked around in the owner app.

Photos (brief §13 — "a digital record of what happened to my car") are
shown on job detail via `GET /owner/attachments/:id/url`, reusing the
same presigned-URL `StorageService` the garage side uses, with the same
ownership check as everything else.

## 11. Design system

Same visual language as garage-web (`ARCHITECTURE.md`, `UX.md`) —
deliberately, not coincidentally: `src/theme/tokens.ts` in owner-mobile
copies garage-web's exact palette (ink/paper/surface/line/graphite/muted,
one signal accent, desaturated good/danger) and typography (IBM Plex Sans
/ Mono, via `@expo-google-fonts`, matching garage-web's self-hosted
fonts) rather than reinventing a mobile-specific look. React Native has
no CSS, so there is no shared token *file* between the two apps — keeping
the values in sync by hand is an accepted small cost; a shared design-
token package is a reasonable future extraction if a third frontend ever
needs the same palette, not justified for two.

UI primitives (`src/components/ui/`): `Text` (typed variants, not ad hoc
styles), `Button` (primary/signal/secondary/ghost/danger, loading state,
44pt+ touch targets), `Card`, `Badge`, `Input`, `Screen` (safe-area +
scroll + pull-to-refresh wrapper every screen uses), and `States`
(loading/error/empty — every data-fetching screen uses these three, never
a bare spinner or a blank view on failure).

## 12. Offline and network resilience

Per brief §23: cached data (TanStack Query's in-memory cache) is visible
immediately on reopening a screen even before a fresh fetch resolves.
Mutations are never optimistic — `useDecideEstimate` and friends only
update what the owner sees once the server has actually confirmed the
action, matching "never pretend an action succeeded if the server hasn't
confirmed it." No sync engine, no mutation queue, no background retry
beyond TanStack Query's default single retry — a complicated offline
architecture was explicitly out of scope for this release, and the
garage-side hardening pass already established that pattern
(`ARCHITECTURE.md` §7b) for the same reason.

## 13. Testing

`apps/api/test/owner-app.e2e-spec.ts` is the release-gate suite for this
phase, mirroring `tenant-isolation.e2e-spec.ts`'s role for the garage
side. It covers: registration and phone-matched linking end to end,
rejecting a link attempt where the phone doesn't match, cross-owner
isolation by id for vehicles/jobs/estimates (not just by list — the
higher bar), staff-vs-owner token cross-use rejected in both directions,
duplicate-registration rejection, and refresh-token rotation/reuse-
detection for owner sessions specifically.

The mobile app itself was verified against the real running API (not
mocked) via a full Expo web export, screenshotted through the entire
golden path: register → no-matches empty state → (via the seeded demo
account) home → active job → estimate review → approve → confirmed state
reflected correctly → vehicle detail → service history (empty) → profile.
No physical device or simulator was available in this environment; the
web export is React Native's own rendering of the same component tree
(not a separate implementation), so this is a real verification of the
actual code, not a facsimile — but real-device gesture/haptic/native-
navigation feel has not been hand-tested and should be part of the first
pilot session with an actual owner.

## 14. What's explicitly deferred

See `OPEN_QUESTIONS.md` for the full list with reasoning; summarized:

- Real push notification delivery (device tokens, Expo push service)
- Vehicles-tab list badge showing a briefly-stale status after an
  owner's own approval (job detail and home are always current)
- Garage-initiated invitation links (an alternative to phone-matched
  self-linking) — not needed until pilot usage shows the self-serve flow
  doesn't work for some real garage's customers
- "Find a garage" discovery, "My car won't move" roadside help — visible
  as disabled/placeholder entry points, not functional
- A shared design-token package between garage-web and owner-mobile
- Cross-garage vehicle identity (the same real car at two garages
  producing two `Vehicle` rows) — pre-existing, unrelated to this phase
