# Platform Admin Console

Le Garage's internal support and oversight tool. Built 2026-10-29 (ADR-0022).

## Who is an admin

A `PLATFORM_ADMIN` is a `StaffMember` of the internal **Le Garage Platform**
organization (`Organization.kind = PLATFORM`). Admins are provisioned
directly in the database by an engineer (seed or a one-off script —
docs/AUTH.md §8). Signup can never create a PLATFORM organization, and no
tenant can invite or promote anyone to `PLATFORM_ADMIN` (the staff
validation schemas don't accept it).

An admin is **not** a member of any customer organization. They sign in at
the normal login page and land on `/admin`.

## What they can do (`/api/v1/admin/*`, `@Roles(PLATFORM_ADMIN)`)

| Route | Purpose |
|---|---|
| `GET /admin/overview` | Counts: organizations by kind, suspended, users, vehicles, open work; newest orgs |
| `GET /admin/organizations?search=&kind=` | Every tenant (never the PLATFORM org) with people/vehicles/open-work counts |
| `GET /admin/organizations/:id` | Profile, staff (name, email/phone, role, active), counts, last 30 audit entries |
| `POST /admin/organizations/:id/suspend` `{reason}` | Block the whole organization |
| `POST /admin/organizations/:id/reactivate` | Restore it |
| `PATCH /admin/staff/:staffId` `{active, reason}` | Deactivate/reactivate one person (also revokes their refresh tokens) |
| `GET /admin/audit?organizationId=&action=&limit=` | Platform-wide audit trail, newest first (≤ 200) |

Every write is audit-logged against the affected organization with the
admin as actor (`ADMIN_ORGANIZATION_SUSPENDED`, `ADMIN_STAFF_DEACTIVATED`, …),
and suspension/deactivation require a written reason.

## What they deliberately can't do

- Edit a tenant's operational or financial records (repairs, estimates,
  approvals, invoices, payments, vehicles). Those stay the tenant's own, and
  their audit trail only ever shows the tenant's own people.
- Change platform admin accounts, or suspend the platform organization.
- Read anything through the normal tenant routes: those are scoped to the
  admin's own (empty) platform organization.

## How suspension and deactivation are enforced

`JwtAuthGuard` re-checks, on every staff request, that the token's
`StaffMember` is still active and its organization isn't suspended — one
primary-key lookup. So both take effect on the very next request, not when
the 15-minute access token expires. Login and refresh-token rotation refuse
the same cases (`ORGANIZATION_SUSPENDED` 403, `STAFF_DEACTIVATED` /
`NO_ACTIVE_STAFF_MEMBERSHIP` 401). This also made a tenant owner's own
"deactivate staff" immediate, which previously lagged by up to 15 minutes.

## Cross-tenant access

The admin service is the second sanctioned user of `prismaUnscoped` (after
auth identity bootstrapping — see `packages/database/src/index.ts`). It is
cross-tenant by definition; the protection is the role check on every
route plus the audit trail, verified in `apps/api/test/platform-admin.e2e-spec.ts`.

## Not built yet

Impersonation ("view as this company"), password resets for tenant users,
billing/subscription state, and an admin-of-admins workflow.
