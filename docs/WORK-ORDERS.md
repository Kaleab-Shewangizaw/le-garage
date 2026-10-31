# Work Orders — fleets and garages working together

Built 2026-10-29 (ADR-0023). Fleets and garages are **separate companies**
on Le Garage. A fleet can send a repair to a garage that's also on the
platform; the garage does the work in its own account; the fleet approves
the estimate and watches progress. Neither ever sees the other's records.

## The flow

| # | Who | What happens |
|---|---|---|
| 1 | Fleet coordinator | Adds the garage from **Providers → Find a garage on Le Garage** (once). |
| 2 | Fleet coordinator | **Request service** → picks that garage → "Send to … now" (or later, from the repair: **Send to …**). |
| 3 | Garage | Gets an in-app notice (bell + **Work orders** badge), an SMS and an email. Opens **Work orders** → **Accept** or **Decline** (with a reason). |
| 4 | Garage | Accepting creates the garage's **own job**, filed under a customer record for the fleet company, with the garage's own copy of the vehicle. The garage works it like any job: diagnosis, photos, estimate. |
| 5 | Fleet | Gets a **copy** of each finding, photo and estimate on its own repair, and the repair moves to *Awaiting approval*. The supervisor/owner approves or rejects each item — **only the fleet can approve**; the garage can't log an approval for it. |
| 6 | Garage | Sees the fleet's decision ("Approved by Dawit Mengistu for Demo Logistics, in Le Garage"), marks approved, repairs, QC, issues its invoice, hands the vehicle back. |
| 7 | Fleet | Its repair follows each step ("Updated by …"), receives a copy of the invoice to record payment against, and closes with a service-history record when the garage hands the vehicle back. The vehicle returns to *Active*. |

Declined → the fleet sees the reason and can send it again or pick another
provider. Before the garage accepts, the fleet can **withdraw** the request
(or cancel the repair, which withdraws it too).

Offline garages (not on Le Garage) keep the manager-led flow: the fleet's
coordinator records their estimate and bill.

## Data model

- `WorkOrder` — the only record spanning two tenants: `fleetOrganizationId`
  + `fleetJobId`, `garageOrganizationId` + `garageJobId` (set on accept),
  `status` (`SENT → ACCEPTED | DECLINED | CANCELLED`), message, decline
  reason, who/when. The tenant-scope guard requires every query to name at
  least one side.
- `ServiceProvider.garageOrganizationId` — a fleet's provider entry that is
  a garage on the platform.
- `Customer.linkedOrganizationId` — the garage's customer record that stands
  for a fleet company.
- Copies on the fleet side carry the source id, unique:
  `Estimate.externalEstimateId`, `EstimateItem.externalItemId`,
  `Diagnosis.externalDiagnosisId`, `Invoice.externalInvoiceId`,
  `Attachment.externalAttachmentId` (photos are **copied** in object storage
  into the fleet's own prefix, so either side deleting its file never breaks
  the other's record).
- `ApprovalMethod.FLEET_PORTAL` — the fleet's decision as recorded on the
  garage's estimate (with the deciding fleet staff member). Never accepted
  from a request body.

## How it stays in sync

`WorkOrderSyncService` listens to audited mutations (`DomainEvents`,
published by `AuditService.record`) — the same single choke point realtime
and notifications use:

| Garage event | Fleet effect |
|---|---|
| `DIAGNOSIS_ADDED` | copy the finding |
| `ATTACHMENT_ADDED` | copy the photo/document (object + row) |
| `ESTIMATE_SENT` | copy as a new SENT estimate version (supersedes a pending one); repair → Awaiting approval; notify approvers |
| `JOB_STATUS_CHANGED` | same move on the fleet repair if valid; notify on started / waiting for parts / complete / handed back / cancelled |
| `INVOICE_ISSUED` / `INVOICE_VOIDED` | copy / void the copy (unless the fleet already paid against it) |

| Fleet event | Garage effect |
|---|---|
| `APPROVAL_RECORDED` (STAFF_DECISION) | record a `FLEET_PORTAL` approval on the garage's estimate with mapped item decisions; notify the garage |
| repair cancelled while still `SENT` | work order withdrawn; notify the garage |

Sync failures are logged and never fail the action that triggered them.

## Rules the API enforces

- While a work order is sent/accepted, the fleet can't create estimates,
  parts, labor or invoices on that repair, or move its status
  (`409 HANDLED_BY_GARAGE`) — except withdrawing before acceptance.
- On a garage job that came from a fleet, the garage can't log an approval
  (`409 APPROVAL_BY_FLEET`) or create a public share link.
- Only a fleet sends, only the receiving garage accepts/declines, only the
  sending fleet withdraws; any other organization gets 404.
- The garage directory exposes only business details (name, city, phone,
  address) of active garages.

## Notifications (SMS / email)

Every notice is stored in-app (the bell) and queued as SMS and email to each
recipient with a phone/email. **No SMS gateway or email service is
configured in this project**, so delivery uses a development log adapter:
the message is written to the API log (`[SMS → +2519…] …`) and marked SENT
with `deliveredVia: "dev-log"`. To go live, implement
`StaffNotificationsService.deliver()` for a real provider.

## Not built yet

- Garage-side controls over who can find them in the directory (opt-out).
- Additional-work approvals initiated mid-repair are supported (a new
  estimate version is copied and can be approved), but there's no "pause
  work until approved" state.
- Delivery receipts / retries for SMS and email.
- Payments flowing between the two sides (each records its own).
