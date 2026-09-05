# Pilot Plan — Le Garage

This document defines how Le Garage gets tested with real garages in
Addis Ababa. It is the operating plan for the pilot, not a feature list —
see `MVP.md` for what's built and `PILOT-FEEDBACK.md` for the running log
of what's actually learned once the pilot starts.

## 1. Philosophy (read this before anything else below)

> We are **not** trying to impress garages with 100 features. We are
> trying to prove one thing: **Le Garage makes running a garage easier.**

3–5 real garages, ideally observed in person. **Do not explain the
software before watching someone try to use it.** The single highest-
value thing this pilot produces is watching a garage owner or mechanic
who has never seen the product attempt the core workflow unguided — that
reveals real UX problems in a way no internal review can. Only step in to
help after they're genuinely stuck, and write down exactly where they got
stuck and what they tried first.

The bar for "the MVP works" is the checklist in `MVP.md` §1 (brief §38):
a real garage can run a real vehicle through intake → diagnosis →
estimate → approval → repair → invoice → payment → collection → service
history using Le Garage, and the owner can see all of it. The pilot's job
is to find out whether that's actually true for a garage that isn't us.

## 2. Who to pilot with

3–5 garages in Addis Ababa. Look for variety, not uniformity — the goal is
representative coverage of the target market described in `ETHIOPIA.md`,
not five copies of the easiest possible customer:

- At least one garage that currently runs entirely on paper/notebook
- At least one that already uses WhatsApp/Telegram as its de facto system
  of record
- A mix of garage sizes (a one-owner-operator shop and a shop with several
  technicians, if possible) — role permissions (`AUTH.md` §3) and the
  technician-vs-front-desk split only get real-world tested with more
  than one person actually using the system
- Willingness to be observed in person for at least the first session —
  a garage that will only ever use it unsupervised via a support call
  isn't useful for this specific pilot goal

## 3. What we want to learn

Organized as the actual questions to answer, not a feature checklist:

**Onboarding & first use**
- Can a new user create their first job (a full intake) without anyone
  explaining the software to them first?
- Where in the flow do they hesitate, misclick, or ask "what do I do
  now?"
- What do they expect to happen that doesn't (violated assumptions are
  more informative than confusion — they reveal the user's actual mental
  model, `PRODUCT.md` §"garage owner thinks... not...")

**Speed & adoption**
- How long does intake actually take, start to finish, compared to their
  current paper/notebook/memory process? (This is the single most
  important number for adoption — brief §20: "every common action should
  be extremely fast.")
- Does the software actually save them time, or does it just move the
  same amount of effort somewhere else?
- What do they keep reaching for WhatsApp/Telegram/paper to do instead of
  the software, even after being shown the equivalent in-app flow? That
  gap is the real backlog, not our assumptions about what's missing.

**Trust & data quality**
- What information do they refuse to enter, or enter with visible
  reluctance (e.g. exact costs, supplier names)? That's a trust signal,
  not a UX bug to just remove the field for.
- What information do staff repeatedly ask a customer for that the
  software should already have (a sign either data isn't being found/
  reused well, or staff don't trust what's on screen)?
- Does the estimate share link (`PRODUCT.md` §10) actually get used, and
  does a customer seeing it change how the approval conversation goes?

**Reaction**
- What feature or screen do they understand and like immediately, with no
  explanation?
- What do they dislike or actively avoid?
- Would they pay for this? (Ask directly, near the end of a session, once
  they've actually used it on a real vehicle — not as a cold hypothetical
  on day one.)

## 4. What NOT to optimize for

- Vanity usage numbers with no decision attached to them
- Feature requests taken at face value before understanding the
  underlying problem (`PILOT-FEEDBACK.md` §"Pain vs. Suggested solution")
- Making the pilot garages happy in the moment at the cost of learning
  something real — a garage being polite about a confusing screen is not
  the same as the screen working

## 5. Practical metrics to track

Pull these from the database (via `AuditLog`/`JobStatusEvent` timestamps,
or a simple query against `apps/api` in the meantime — no dedicated
analytics endpoint exists yet, see `OPEN_QUESTIONS.md`) rather than
guessing:

| Metric | How to get it | Why it matters |
|---|---|---|
| Jobs created | `count(Job)` per organization | Baseline adoption |
| Jobs completed (reached `CLOSED`) | `count(Job WHERE status = CLOSED)` | Whether the *whole* loop gets used, not just intake |
| Average intake time | Time between job's first `JobStatusEvent` (none — use `Job.createdAt`) and the intake form being submitted, timed by hand during in-person sessions for now | The #1 adoption number, per §3 above |
| Estimate approval rate | `count(Approval WHERE itemDecisions all APPROVED) / count(Estimate WHERE status = SENT)` | Whether the estimate/approval flow is trusted enough to actually get used for its purpose |
| Jobs with photos attached | `count(distinct jobId in Attachment) / count(Job)` | Whether the evidence-trail trust model (`PRODUCT.md` §10) is actually adopted, not just built |
| Payments recorded | `count(Payment)` | Whether the financial half of the loop is used, or garages quietly keep using cash-only paper records alongside it |
| Active garage-days | Distinct days with at least one `AuditLog` row per organization | Repeat usage vs. a one-time trial |
| Estimate share links opened | Not yet tracked — `Estimate.shareToken` exists but no view-count; see `OPEN_QUESTIONS.md` if this becomes important | Whether the customer-facing trust feature reaches customers at all |

**Do not build a dashboard for these before the pilot starts.** A few
direct SQL queries run by hand after each pilot session is enough at this
scale, and building tooling around metrics before knowing which ones
actually matter is exactly the kind of premature feature work this phase
is supposed to avoid (brief §29).

## 6. Session structure (per garage, first visit)

1. **Setup** (before the visit): create the garage's organization via
   `/register`, seed nothing else — let the first real vehicle be their
   first real job.
2. **Watch, don't teach** (10–20 min): hand them a device already on the
   login screen. Ask them to log in and "do what you'd normally do when a
   car comes in." Say nothing else. Take notes on hesitation points,
   wrong turns, and questions asked out loud.
3. **Debrief** (10 min): ask the §3 questions directly. Ask what they
   expected to happen at the points where they hesitated.
4. **Guided second pass** (optional, if time allows): show them anything
   they missed, and watch whether it's remembered and used unprompted
   later in the visit.
5. **Write it up immediately** in `PILOT-FEEDBACK.md` — impressions fade
   fast; don't wait until end of day.

## 7. Timeline (indicative — adjust once the first session happens)

- **Week 1:** first 1–2 garages, in person, both sessions structured as
  above. Expect to find real bugs and real UX problems — that's the
  point.
- **Week 2:** fix what §7 of this doc's own findings surface as clearly
  broken (not every piece of feedback — see `PILOT-FEEDBACK.md`'s
  pain-vs-solution triage), then bring in garages 3–5.
- **Week 3-4:** repeat visits with the first garages to see whether real
  usage sticks (the "active garage-days" metric matters more here than
  raw job counts), plus first visits with any remaining garages.
- **After:** a genuine go/no-go decision on Phase 10 (owner app),
  informed by whether the garage-side loop actually proved itself with
  real garages, not by a fixed calendar date.

## 8. Definition of a successful pilot

Not a specific number. The pilot succeeds if, honestly assessed:

- At least one garage completed the full loop (intake through collection
  and payment) on a real vehicle without needing us to intervene
  mid-workflow.
- We can point to specific, concrete UX problems found by watching real
  use — not hypothetical ones we imagined in advance.
- We have a real answer (not a guess) to "would they pay for this," even
  if that answer is "not yet, because X."
- We know which of the roadmap items in `ROADMAP.md` §"Post-MVP" are
  actually the next real priority, versus things we assumed would matter
  but pilot usage shows otherwise.

If none of that is true after the first few sessions, the right move is
to fix what's clearly broken and pilot again — not to add features.
