# UX Principles — Le Garage

## 1. The core risk

Adoption, not feature completeness, is the biggest product risk. A garage
owner or mechanic will not use software slower than paper, a notebook, or a
WhatsApp message. Every screen is judged against that bar.

## 2. Garage-side UX rules

- **Every common action must be fast.** The reference case: creating a job
  should feel like `plate → customer → vehicle → mileage → complaint →
  photos → done`, not a 15-field form.
- **Search-first, not form-first.** Intake starts with typing a plate (or
  scanning it — camera OCR is a plausible fast-follow, not MVP). The system
  looks up matching customers/vehicles before asking staff to type anything
  that already exists.
- **Big touch targets, minimal typing.** The user may be standing next to a
  car with dirty hands, on a phone, in daylight glare. Prefer selection
  (chips, dropdowns, cause/severity pickers) over free text where the value
  set is known; keep free text for the things that genuinely need it
  (complaint description, notes).
- **Camera access is a first-class input**, not an afterthought attachment
  picker — intake photos and diagnosis photos should be reachable in one
  tap from the relevant screen.
- **Status changes are one tap.** Moving a job forward in its lifecycle
  should never require navigating through an edit form.
- **Responsive across phone/tablet/desktop**, because garages will use
  whatever device is at hand — not a phone-only or desktop-only design.
- **Low cognitive load over information density.** The dashboard answers
  "what's happening right now," not "here is every metric we could compute"
  (`PRODUCT.md` §"Garage Dashboard" intent, `DOMAIN.md`).

## 3. Owner-app UX rules

- Calm, modern, consumer-grade — this is a trust product, and visual
  polish is part of how trust is communicated to a first-time user.
- Lead with **"what's happening with your car"**, not a garage directory or
  a feature menu. The two strongest initial screens are **My Vehicle** and
  **My Current Repair** (with a clear timeline: Received → Diagnosis →
  Waiting for approval → Waiting for parts → Repairing → Quality check →
  Ready → Collected).
- Avoid automotive jargon; where technical terms are unavoidable (a
  diagnosis written by a technician), present them plainly with the
  technician's own note rather than translating/dumbing it down
  inaccurately.
- Approval screens must make it unambiguous **what** is being approved and
  **what it costs**, itemized — this is the single highest-trust moment in
  the owner experience and should never be a vague "approve repair" button.

## 4. Non-goals for MVP UX

- No onboarding tutorials/tours — the flows should be self-explanatory
  given the above rules; add guided onboarding only if pilot usage shows
  it's actually needed.
- No customizable dashboards/widgets — one well-designed default view.
- No native iOS for owner-mobile at launch (Expo/RN makes it possible
  later without a rewrite, but Android-first is the explicit target,
  `ETHIOPIA.md`).

## 5. How this doc is used

`garage-web` and `owner-mobile` component/screen decisions should be
traceable back to one of the rules above. If a proposed screen can't be
justified against them, that's a signal to simplify it, not a reason to
add a new rule.

## 6. Mobile audit findings (pilot-hardening pass)

A real narrow-viewport (375px) pass through Job Detail caught two
concrete violations of §12 ("the interface must remain usable... not
simply make everything tiny") that a desktop-only check would have
missed entirely:

- **The job timeline's 8 stage labels collided into unreadable run-on
  text** at phone width. Fixed by letting the timeline scroll
  horizontally below a minimum width rather than compressing labels past
  legibility (`components/jobs/job-timeline.tsx`) — a standard, familiar
  pattern (the same one iOS/Android step-indicators use), not a
  compromise.
- **The estimate line-item builder's Description field collapsed to a
  handful of pixels** once type/qty/price/delete controls all had to fit
  the same row on a phone — the single most important field in that row
  became the least usable. Fixed by giving Description its own full-width
  row, with the secondary controls (type/qty/price) wrapping to a second
  row (`components/jobs/tabs/estimate-tab.tsx`).

Neither was visible in a desktop review — both only showed up by actually
rendering the page at a real small-phone width, per this doc's own
instruction (§12, brief). Treat "did I check it at 375px" as a real step
in reviewing any new garage-web screen, not an afterthought.
