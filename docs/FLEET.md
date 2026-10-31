# Fleet Maintenance — Le Garage for companies that run their own vehicles

Status: **first vertical slice built** (2026-10-29). This is a product
hypothesis being validated with fleet operators, not a proven model — see
§8.

## 1. What it is

A fleet maintenance and repair operations product for companies that run
roughly 10–100 vehicles (logistics/distribution first; later rental,
transport operators, NGOs, company cars). It helps them **control vehicle
downtime, coordinate repairs with outside garages, approve maintenance
spend, and keep reliable vehicle records.**

Explicitly *not* in scope for the first release: GPS/telematics, live maps,
dispatch, fuel sensors, route optimization, AI predictions, a public
garage marketplace.

## 2. How it fits the existing system (ADR-0021)

A fleet company is an `Organization` with `kind = FLEET`. Everything else is
the platform that already exists:

| Fleet concept | Implemented as |
|---|---|
| Company account, staff, roles | `Organization` + `StaffMember` — same auth, same tenant isolation |
| Company workspace | the org's single `Garage` row (named after the company) — every `StaffMember`/`Job` requires one |
| Vehicle register | `Vehicle` + new `vehicleType`, `status` |
| Service request → repair | `Job` with `customerId = null` |
| Vehicle profile | `Vehicle` profile fields (fuel, driver, acquired date, notes) + `GET /vehicles/:id/visits` |
| Photo proof | `Attachment` with a `tag` (before/after, damage, replaced part, receipt, document…) and `caption` |
| External garage | `ServiceProvider` (org-private directory) on `Job.serviceProviderId` |
| Inspection/diagnosis | `Diagnosis` (severity, photos via `Attachment`), `JobNote` |
| Repair estimate | versioned `Estimate`/`EstimateItem` (frozen once submitted) |
| Manager approval/rejection | `Approval` with `method = STAFF_DECISION`, `decidedByStaffId` |
| Final costs | `JobPart`/`JobLabor` → versioned `Invoice` (items typed PART/LABOR) |
| Payment to provider | `Payment` |
| Repair history | `ServiceRecord`, written when the vehicle returns to service |
| Change record | `AuditLog` (status changes, approvals, provider/vehicle edits) |

Garage organizations are unchanged; `kind` defaults to `GARAGE`.

## 3. Workflow

Same state machine as a garage job (`apps/api/src/jobs/job-state-machine.ts`),
fleet wording in the UI (`apps/garage-web/src/lib/job-labels.ts`):

```
Requested (INTAKE) → Inspection (DIAGNOSING) → Awaiting approval (WAITING_APPROVAL)
  → Approved → Repairing (IN_PROGRESS) [⇄ Waiting for parts] → Quality check
  → Repair complete (READY) → Back in service (COLLECTED → CLOSED, ServiceRecord written)
```

Fleet-specific rules (server-side):

- A fleet job **must not** have a customer; a garage job **must** (`JobsService.createIntake`).
- Repairs can't be opened on a `RETIRED` vehicle.
- Only **OWNER/MANAGER** may approve or reject; the decision is recorded as
  `STAFF_DECISION` with the deciding staff member. Garages can't use
  `STAFF_DECISION`; fleets can't use the customer methods.
- Approving at least one item moves the repair `WAITING_APPROVAL → APPROVED`
  automatically. Rejecting everything leaves it awaiting a revised estimate
  or cancellation.
- Moving to `APPROVED` requires an approved item on the **current** estimate
  version (closes a gap where an old version's approval unlocked a new one —
  applies to garages too).
- Returning to service requires an issued invoice (final cost recorded).
- Fleet estimates can't get a public share link (no customer; internal costs).

## 4. Vehicle availability

`Vehicle.status`: `ACTIVE`, `IN_MAINTENANCE`, `UNAVAILABLE`, `RETIRED`.

- Opening a repair sets an `ACTIVE` vehicle to `IN_MAINTENANCE`; closing or
  cancelling its last open repair sets it back to `ACTIVE`. Recomputed from
  open jobs each time (`JobsService.syncVehicleAvailability`), so it self-corrects.
- `UNAVAILABLE` and `RETIRED` are manual decisions and are never overridden
  automatically. Mechanics can't change status.
- Every change is audit-logged (`VEHICLE_STATUS_CHANGED`, with the reason).

## 5. Roles (existing `Role` enum, fleet names in the UI)

| Role | Fleet name | Can |
|---|---|---|
| `OWNER` | Owner | holds the account: everything, incl. appointing other owners; oversees and administers |
| `MANAGER` | Supervisor | runs day-to-day: approve/reject spend, reports, add/manage employees (never owners) |
| `FRONT_DESK` | Coordinator | create service requests, photos, providers, estimates, record costs/payments, fleet summary — **not** approve, not spend reports |
| `TECHNICIAN` | Mechanic | diagnose, notes, parts/labor, workshop status moves — no approvals, reports, vehicle status, or providers |

## 6. Reporting (`GET /reports/*`)

Every figure is computed from recorded data; nothing is projected.

- **Spend** = `ISSUED` invoices by issue date (voided excluded), per vehicle,
  per provider, and by category (parts / labor / tax / discount; invoices
  generated before categories existed show as "not categorized").
- **Downtime** = time each repair kept its vehicle off the road
  (reported → back in service, or → now if still open), clipped to the range.
- **Turnaround** = mean reported → repair complete for repairs completed in range; `null` (not 0) when there are none.
- Range is `[from, to)`, max 366 days. Amounts are santim (1/100 ETB). CSV export is client-side.

## 6b. Vehicle profile and photo proof

Each fleet vehicle has a profile page: details (type, fuel, colour, VIN,
date it joined the fleet, assigned driver, notes), a cover photo, totals
(visits, invoiced, unpaid, time off the road, last service), and the
**visit history** — every service request with findings, provider, cost,
downtime and its photos (`GET /vehicles/:id/visits`, one query).

Photos are ordinary `Attachment`s on the repair (`JOB`) or the vehicle
(`VEHICLE`), stored privately in object storage and served via short-lived
signed URLs. A `tag` says what each one proves (`BEFORE_REPAIR`,
`AFTER_REPAIR`, `OLD_PART`, `DAMAGE`, `RECEIPT`, `DOCUMENT`, `CONDITION`,
`VEHICLE_PROFILE`), chosen at upload and changeable later
(`PATCH /files/:id`, audit-logged). Drivers are profile contact details,
not accounts, for now.

## 6c. Team rules

Only an owner can add an owner, promote someone to owner, or change an
existing owner; nobody can change their own role or deactivate
themselves; an organization always keeps one active owner. An email or
phone that already signs in to another organization can't be invited (sign-in
lands a person in one organization). Deactivation takes effect immediately.

## 7. Service providers

Providers are either **on Le Garage** (connected to a garage organization —
repairs go to them as work orders they accept and work in their own account,
see docs/WORK-ORDERS.md) or **offline** (the fleet's staff record their
estimate and bill, as below).


`ServiceProvider` is tenant-scoped like `Customer`: one company's provider
list, and what it spends with each, is never visible to another. In the
first release providers have **no login** — the fleet's coordinator records
each provider's estimate and final bill (manager-led). A provider portal
(provider users who can see only jobs explicitly assigned to them) is the
designed next step: `Job.serviceProviderId` is already the assignment it
would authorize against.

## 8. Assumptions to validate with fleet operators

1. Is the owner/supervisor split right, and is a single approver role enough, or do they need spend thresholds (e.g. coordinator up to ETB X)?
2. May the person who entered an estimate also approve it (separation of duties)?
3. Do they pay providers per job or on monthly statements? (Payments are per invoice today.)
4. Is "how long was each vehicle off the road" the number they'd pay for, or is it spend control?
5. Would their garages ever enter estimates themselves (provider portal), or is phone/WhatsApp + coordinator entry the reality?
6. Which documents/expiry dates matter most (insurance, Bolo/annual inspection, road fund, permits)?

## 9. Not built yet (next)

- Preventive maintenance schedules (date/odometer) with due/overdue lists.
- Vehicle documents with expiry dates and reminders.
- Driver assignment to vehicles; driver-reported problems.
- Provider portal (scoped provider accounts).
- Notifications (SMS/Telegram) for approvals waiting and vehicles overdue.
