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
- **Idempotency:** mutation endpoints that a flaky-connectivity client
  might retry (payment recording, approval submission) accept an optional
  `Idempotency-Key` header; a repeated key with the same body returns the
  original result instead of double-applying (`ARCHITECTURE.md` §7).

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
PATCH  /api/v1/jobs/:id/status                    state-machine-validated transition (COLLECTED auto-cascades to CLOSED + ServiceRecord)
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

### `files`
```
POST   /api/v1/files/presign           issue a scoped, short-lived upload URL
POST   /api/v1/files                   register uploaded object as an Attachment (entityType/entityId)
GET    /api/v1/files/:id/url           signed read URL
```
Not yet implemented (schema exists via `Attachment` — see `ROADMAP.md`).

### `dashboard`
```
GET    /api/v1/dashboard/summary       counts by status, outstanding balance, today's activity
```

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

Realtime (`Socket.IO` job-board push updates) is planned once the polling
dashboard is in place and demonstrably needs push — not built in the first
pass (`ARCHITECTURE.md` §4).
