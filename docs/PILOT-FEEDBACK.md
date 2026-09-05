# Pilot Feedback Log — Le Garage

A running log of what pilot garages actually say and do, structured so
**the underlying problem** doesn't get lost inside **someone's proposed
fix**. See `PILOT.md` for the pilot plan this feeds into.

## How to use this file

Every entry gets one category. Don't skip straight to "so we should
build X" — write down the pain first, on its own, before writing down
what anyone (including us) thinks the fix is.

| Category | What goes here |
|---|---|
| **Usability problem** | Something in the existing product confused, slowed down, or blocked someone from doing something the product is supposed to support. |
| **Missing feature** | Something the garage needs to do that the product genuinely has no way to do at all (not "does it clumsily"). |
| **Bug** | The product did something wrong relative to its own intended behavior — not a design opinion. |
| **Misunderstanding** | The user's mental model didn't match the product's, and no data was lost or workflow blocked — just confusion that resolved itself or with a one-line explanation. |
| **Workflow mismatch** | The product's assumed process doesn't match how this garage (or garages generally) actually work — not necessarily a bug, but a real gap between the model in `DOMAIN.md` and reality. |
| **Performance problem** | Something was slow enough to notice/complain about. |
| **Feature request** | The user explicitly asked for something new, unprompted. |

**Separate the pain from the suggested solution.** A garage owner asking
for "a button to text the customer" is really telling you the pain is "I
have to leave the app to notify someone" — the suggested solution (a
button, specifically for texting) might not be the right fix even when
the underlying pain is completely real. Record both, but don't let the
suggested solution be the only thing captured.

**Do not treat this file as a backlog.** Triage happens separately (see
§"Triage" below) — this file is the raw record.

---

## Entry template

Copy this for each new item:

```md
### [YYYY-MM-DD] Garage: <name/anonymized ID> — <category>

**What happened:** (what we observed or were told, as close to verbatim
as practical — avoid pre-interpreting in this line)

**Pain (the underlying problem):**

**Suggested solution (if any was offered, by the user or by us — mark
which):**

**Severity:** blocked them completely / slowed them down significantly /
minor annoyance / didn't affect the session but worth knowing

**Status:** new / triaged / actioned / declined (with reason) / needs more data
```

---

## Log

*(No pilot sessions have run yet — this section fills in as they happen.
Do not pre-populate with hypothetical feedback; an empty log is the
honest state before the pilot starts.)*

---

## Triage

Review this file after each pilot session (`PILOT.md` §6 step 5) and
promote real, validated findings here — grouped, not one-to-one with raw
log entries, since multiple people often report the same underlying pain
differently.

| Pain (validated, seen more than once or clearly severe) | Category | Proposed direction | Status |
|---|---|---|---|
| *(empty until the pilot runs)* | | | |

**Triage rules:**
- A pain reported by only one garage, once, mildly — note it, don't act
  on it yet. Wait to see if it recurs.
- A pain that **blocked** someone from completing the core loop (`MVP.md`
  §1) — treat as high priority regardless of how many garages hit it.
- A **feature request** only gets promoted to "proposed direction" once
  the underlying pain is understood well enough to judge whether the
  requested feature is actually the right fix (brief §24 — "do not
  immediately implement every request").
- If a proposed direction would meaningfully expand scope beyond
  `MVP.md`/`ROADMAP.md`, it goes through the same "is this necessary for
  the pilot, or a real feature-building decision" judgment call the rest
  of this project uses — not an automatic yes because a garage asked for
  it.
