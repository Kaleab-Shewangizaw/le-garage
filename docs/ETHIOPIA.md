# Ethiopia Market Considerations — Le Garage

Concrete constraints from the initial market (Addis Ababa) and how the
architecture accommodates them without over-building on day one. Nothing
here should be read as a demographic/market-size claim — those would be
unverified statistics and are deliberately not fabricated (`PRODUCT.md` and
brief §24 instruction).

## 1. Device & connectivity

- **Android-first.** `owner-mobile` targets Android first (React
  Native/Expo keeps iOS reachable later without a rewrite, `ARCHITECTURE.md`
  §4). No iOS-only feature should ever exist.
- **Relatively inexpensive Android phones** are common among both
  technicians and owners → avoid animation-heavy/high-memory UI, keep
  bundle size and image sizes down, test on mid/low-tier devices before
  calling a mobile feature done.
- **Unreliable connectivity** → see `ARCHITECTURE.md` §7 for the specific,
  scoped offline approach (queued writes for approvals, cached reads for
  already-fetched vehicle/job data, idempotent write APIs). Not "offline
  everything" — the specific workflows that need it, identified as each is
  built.

## 2. Payments

Cash, Telebirr, and bank transfer are the payment realities on the ground.
`Payment.method` models exactly these three (plus `OTHER`) in MVP
(`DATABASE.md` §8). The platform **records** payments; it does not process
them (no in-app Telebirr/card processing integration in MVP — brief §10/§16
explicitly warns against building complicated payment infrastructure before
it's necessary).

## 3. Communication channels

SMS, Telegram, WhatsApp, and phone calls are the default communication
tools garages and customers already use. Per `PRODUCT.md`/`ARCHITECTURE.md`,
the platform owns the structured data (estimates, statuses, invoices) and
sends notifications through these existing channels (Phase 11) rather than
building a proprietary messaging system.

## 4. Informal workshops & fragmented history

Many workshops today run on paper, notebooks, spreadsheets, or memory, with
no structured service history. This is precisely the gap Le Garage exists
to close (`PRODUCT.md` §2) — it means:
- Intake must be genuinely faster than the paper it replaces (`UX.md`) or
  adoption fails immediately.
- Vehicles/customers entering the system for the first time will have zero
  prior digital history — the product must be useful from a vehicle's very
  first visit, not only valuable after years of accumulated data.

## 5. Parts market realities

Volatile pricing and counterfeit/low-quality part concerns are real. MVP's
response is structural, not a features list: recording part
brand/condition/supplier/warranty per job (`DOMAIN.md` §3 `JobPart`) creates
the evidence trail that lets trust be built over time (`PRODUCT.md` §10),
without the platform attempting to police the parts market directly in MVP.

## 6. Trust between owners and mechanics

The single biggest cultural/product problem this platform addresses.
Handled structurally throughout the domain model (append-only diagnosis,
versioned estimates, scoped approvals, audit trail — `DOMAIN.md` §8), not
through a bolt-on "trust score" feature.

## 7. Localization (Amharic, Ethiopian calendar/time)

**Not built in MVP.** The architecture must not make these impossible
later:
- Text: avoid hardcoding user-facing strings inline without a lightweight
  i18n seam (a simple key-based string lookup is enough for now — a full
  i18n framework is not justified until Amharic UI is actually being built).
- Dates: store all timestamps in UTC (standard practice, also keeps a
  future Ethiopian-calendar *display* layer purely a presentation concern —
  conversion at render time, not stored as an alternate calendar value).
- No architectural decision in `DATABASE.md`/`ARCHITECTURE.md` assumes
  Gregorian-only display; it assumes Gregorian storage, which is different
  and does not block adding an Ethiopian-calendar view later.

## 8. What this doc explicitly does not do

It does not claim market size, user counts, willingness-to-pay, or
competitive landscape facts — none of that is known yet. Any number that
sounds like a market statistic anywhere in this project's docs should be
treated as fabricated and removed; none should exist.
