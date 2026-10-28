# API — Le Garage

## 1. Conventions

- **Base path:** `/api/v1`. Versioned in the URL from day one (brief §19.7
  "keep APIs predictable and versionable") — cheap to do now, expensive to
  retrofit.
- **Format:** JSON in, JSON out. `Content-Type: application/json` except
  file upload URL issuance (still JSON — the actual file bytes go straight
  to object storage via a presigned URL, `SECURITY.md` §7).
- **Auth:** `Authorization: Bearer <accessToken>` header on every route
  except `POST /auth/login`, `POST /auth/refresh`, and health checks.
- **Errors:** structured, consistent shape:
  ```json
  {
    "error": {
      "code": "JOB_INVALID_TRANSITION",
      "message": "Cannot move job from READY to DIAGNOSING",
      "details": {}
    }
  }
  ```
  `code` is a stable machine-readable string (used by clients for
  conditional logic), `message` is human-readable (safe to show in UI or
  log), `details` is optional structured context. HTTP status codes follow
  standard semantics (400 validation, 401 unauthenticated, 403 wrong role
  but right tenant, 404 not found *or* wrong tenant per `AUTH.md` §6, 409
  conflict/invalid state transition, 422 semantically invalid input, 500
  unexpected).
- **Pagination:** cursor-based (`?cursor=&limit=`) on list endpoints,
  default `limit=20`, max `100`.
- **IDs:** UUIDs in URLs (`/jobs/:jobId`).
- **Idempotency:** an optional `Idempotency-Key` header protects the
  highest-risk mutations from duplication — job creation, estimate send,
  approval recording, invoice issuance, payment recording, and job status
  transitions (`@Idempotent()` in `apps/api/src/common/interceptors/
  idempotency.interceptor.ts`, `DECISIONS.md` ADR-0015). A repeated key
  against the same route replays the original response; a key still
  `PENDING` (a genuinely concurrent duplicate) is rejected with `409
  DUPLICATE_REQUEST_IN_PROGRESS`. Routes without the decorator ignore the
  header entirely — it's opt-in per route, not a global behavior.
- **Realtime:** Socket.IO at `/realtime` (same origin, separate namespace
  from the REST API), authenticated via the same access token passed in
  the connection handshake (`auth: { token }`). Events (`job:changed`,
  `board:changed`) carry only IDs, never data — the client always
  refetches over REST (`ARCHITECTURE.md` §"Realtime", `DECISIONS.md`
  ADR-0016). Not a source of truth; safe to ignore entirely and just poll
  if a client doesn't implement it.

## 2. Module → route map (MVP)

### `auth`
```
POST   /api/v1/auth/login              staff login (email/phone + password)
POST   /api/v1/auth/refresh            rotate refresh token → new access+refresh
POST   /api/v1/auth/logout             revoke current refresh token
GET    /api/v1/auth/me                 current user + active staff context
```

### `organizations` / `garages`
```
POST   /api/v1/organizations           create org + owner user + garage (signup)
GET    /api/v1/garages/me              current garage profile
PATCH  /api/v1/garages/me              update garage profile     [OWNER, MANAGER]
```

### `staff`
```
GET    /api/v1/staff                   list staff at current garage
POST   /api/v1/staff/invite            invite/create staff member  [OWNER, MANAGER]
PATCH  /api/v1/staff/:staffId          change role / deactivate    [OWNER, MANAGER]
```

### `customers`
```
GET    /api/v1/customers?search=       search by name/phone
POST   /api/v1/customers               create
GET    /api/v1/customers/:id
PATCH  /api/v1/customers/:id
```

### `vehicles`
```
GET    /api/v1/vehicles?search=        search by plate/VIN
POST   /api/v1/vehicles                create
GET    /api/v1/vehicles/:id
PATCH  /api/v1/vehicles/:id
GET    /api/v1/vehicles/:id/jobs       job history for this vehicle
```

### `jobs` (job card)
```
POST   /api/v1/jobs                              create (intake) — customer+vehicle+complaint+mileage
GET    /api/v1/jobs?status=&search=&mine=true     dashboard/board query; mine=true = caller's own assigned jobs
                    &assignedTechnicianId=
GET    /api/v1/jobs/:id                           full job card (diagnoses/notes/estimates/approvals/parts/labor/invoices embedded)
PATCH  /api/v1/jobs/:id/status                    state-machine-validated transition (COLLECTED auto-cascades to CLOSED + ServiceRecord);
                                                   optimistic-concurrency guarded — 409 JOB_CONCURRENTLY_MODIFIED if the job moved since you last read it (DECISIONS.md ADR-0014)
PATCH  /api/v1/jobs/:id/assign                    assign technician  [OWNER, MANAGER, FRONT_DESK]
GET    /api/v1/jobs/:id/events                    JobStatusEvent history
```

### `diagnoses`
```
POST   /api/v1/jobs/:jobId/diagnoses   add diagnosis entry (append-only)
GET    /api/v1/jobs/:jobId/diagnoses
```

### `notes` — freeform technician/staff log entries (docs/DOMAIN.md §3)
```
POST   /api/v1/jobs/:jobId/notes       add note (append-only)
GET    /api/v1/jobs/:jobId/notes
```

### `estimates`
```
POST   /api/v1/jobs/:jobId/estimates            create/replace DRAFT
POST   /api/v1/jobs/:jobId/estimates/:id/send   DRAFT → SENT (freezes it, DOMAIN.md §6)
GET    /api/v1/jobs/:jobId/estimates            all versions
GET    /api/v1/jobs/:jobId/estimates/latest
```

### `approvals`
```
POST   /api/v1/estimates/:estimateId/approvals   record decision (per-item)
GET    /api/v1/jobs/:jobId/approvals
```

### `parts` — job-scoped, feeds invoicing (docs/DOMAIN.md §3)
```
POST   /api/v1/jobs/:jobId/parts               add part (any staff)
GET    /api/v1/jobs/:jobId/parts
PATCH  /api/v1/jobs/:jobId/parts/:partId       [OWNER, MANAGER, FRONT_DESK]
DELETE /api/v1/jobs/:jobId/parts/:partId       [OWNER, MANAGER, FRONT_DESK]
```
All four are refused with `409 JOB_ALREADY_INVOICED` once the job has an
`ISSUED` invoice.

### `labor` — same shape and lock as `parts`
```
POST   /api/v1/jobs/:jobId/labor               add labor entry (any staff)
GET    /api/v1/jobs/:jobId/labor
PATCH  /api/v1/jobs/:jobId/labor/:laborId      [OWNER, MANAGER, FRONT_DESK]
DELETE /api/v1/jobs/:jobId/labor/:laborId      [OWNER, MANAGER, FRONT_DESK]
```

### `invoices` — generated from actual parts/labor, versioned like estimates
```
POST   /api/v1/jobs/:jobId/invoices                    generate/regenerate DRAFT   [OWNER, MANAGER, FRONT_DESK]
POST   /api/v1/jobs/:jobId/invoices/:id/issue           DRAFT → ISSUED (freezes it) [OWNER, MANAGER, FRONT_DESK]
POST   /api/v1/jobs/:jobId/invoices/:id/void            ISSUED → VOID, refused if it has payments [OWNER, MANAGER]
GET    /api/v1/jobs/:jobId/invoices                     all versions
GET    /api/v1/jobs/:jobId/invoices/latest              includes computed amountPaid/balance
```

### `payments` — recorded, not processed (docs/ETHIOPIA.md §2)
```
POST   /api/v1/invoices/:invoiceId/payments             record (amount, method, reference)  [OWNER, MANAGER, FRONT_DESK]
GET    /api/v1/invoices/:invoiceId/payments
GET    /api/v1/invoices/:invoiceId/payments/balance      { total, amountPaid, balance }
POST   /api/v1/invoices/:invoiceId/payments/:id/void     [OWNER, MANAGER]
```
`record` requires the invoice to be `ISSUED` and rejects an amount that
would exceed the outstanding balance (`400 PAYMENT_EXCEEDS_BALANCE`).

### `service-history` — durable, owner-facing (docs/DOMAIN.md §3/§8)
```
GET    /api/v1/vehicles/:id/service-history    ServiceRecord[], newest first
```
Written automatically when a job reaches `COLLECTED` — there is no create
route; it is not a user-facing write.

### `files` — photo/document evidence (docs/DOMAIN.md §3, docs/SECURITY.md §7)
```
POST   /api/v1/files/presign           issue a scoped, short-lived upload URL   [rate-limited, 30/min]
POST   /api/v1/files                   register uploaded object as an Attachment (entityType/entityId)
GET    /api/v1/files?entityType=&entityId=   list attachments for one entity
GET    /api/v1/files/:id/url           signed read URL (10 min expiry)
DELETE /api/v1/files/:id
```
`entityType` is one of `JOB`/`DIAGNOSIS`/`ESTIMATE`/`VEHICLE`; the entity
must belong to the caller's organization or `presign`/list/register 404.
Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`,
`application/pdf`; 20MB limit (75MB for video) — enforced in
`packages/validation/src/files.ts` and re-checked server-side, never
trusted from the client alone.

### `public` — the only unauthenticated surface (docs/DECISIONS.md ADR-0018)
```
GET    /api/v1/public/estimates/:token   read-only estimate + vehicle + garage info, no auth
POST   /api/v1/jobs/:jobId/estimates/:estimateId/share   generates/returns the share token   [staff-authenticated]
```
Security rests on the token being unguessable (192 bits), not on
tenant scoping — there is no organizationId to scope an anonymous
request by. Rate-limited (30/min) against enumeration attempts.

### `dashboard`
```
GET    /api/v1/dashboard/summary       counts by status, outstanding balance, today's activity
```

### `owner` — vehicle-owner (owner-mobile), Phase 10 (docs/OWNER-APP.md)
A separate route group, not staff-authenticated: every route is
`@Public()` at the global-guard level and instead protected by
`OwnerJwtAuthGuard`, verifying a token signed with a different secret
than staff's (`docs/DECISIONS.md` ADR-0020). Authorization here is
ownership/linkage (`OwnerAccessService`, checked against the caller's own
confirmed `CustomerLink` rows), not garage RBAC — cross-owner access
returns 404, never 403, matching the staff tenant-isolation convention.
```
POST   /api/v1/owner/auth/register             create an owner account
POST   /api/v1/owner/auth/login
POST   /api/v1/owner/auth/refresh
POST   /api/v1/owner/auth/logout               [OwnerJwtAuthGuard]
GET    /api/v1/owner/auth/me                   [OwnerJwtAuthGuard]

GET    /api/v1/owner/customer-matches          Customer records across any org matching the caller's own phone
GET    /api/v1/owner/customer-links            confirmed links for the caller
POST   /api/v1/owner/customer-links            confirm a match (re-verifies the phone server-side)

GET    /api/v1/owner/vehicles                  vehicles currently owned by the caller's linked customers
GET    /api/v1/owner/vehicles/:id              + active job summary, service history

GET    /api/v1/owner/jobs/:id                  full detail: diagnoses, estimates, approvals, invoices, attachments
                                                (no raw JobPart/JobLabor — see docs/OWNER-APP.md §6)

POST   /api/v1/owner/estimates/:id/decide      per-item approve/reject; reuses ApprovalsService.create verbatim

GET    /api/v1/owner/attachments/:id/url       presigned read URL, ownership-checked

GET    /api/v1/owner/notifications
POST   /api/v1/owner/notifications/:id/read
POST   /api/v1/owner/notifications/read-all
```
All `/owner/*` routes marked `[OwnerJwtAuthGuard]` above (and every route
not listed as unauthenticated) require an owner access token; a staff
token fails signature verification against it outright.

### Admin (`PLATFORM_ADMIN` only, cross-tenant)
```
GET    /api/v1/admin/organizations
GET    /api/v1/admin/garages
GET    /api/v1/admin/jobs
```

## 3. Authorization matrix (see `AUTH.md` §3–4 for full detail)

Every route above declares `@Roles(...)`; unlisted default is "any
authenticated staff member of the resolved tenant." Owner-app routes
(Phase 10) are a separate route group (`/api/v1/owner/...`) with a distinct
authorization path (ownership/linkage, not garage RBAC).

## 4. What's not built yet

Realtime (`Socket.IO` job-board/job-detail push updates) is built — see
`ARCHITECTURE.md` §7a. What's still not built:

- Real push notification delivery for owner-mobile (device-token
  registration, an actual push-service call) — `Notification` rows are
  written but never sent as an OS-level push (`OWNER-APP.md` §9).
- A garage-initiated owner invitation link, as an alternative to the
  phone-matched self-linking flow (`OWNER-APP.md` §5).
- Owner discovery of garages ("Find a garage") and roadside assistance
  ("My car won't move") — visible as disabled placeholders in
  owner-mobile, no backend support.
