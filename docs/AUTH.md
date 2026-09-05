# Authentication & Authorization — Le Garage

## 1. Principle

"Use a well-designed authentication solution rather than inventing
authentication from scratch" (brief §16). This does **not** mean bolting on
a third-party identity SaaS in week one of an MVP with no users — it means:
don't hand-roll cryptography, don't invent a session/token scheme from
scratch, and don't skip the well-understood parts (password hashing,
token rotation, expiry). We use:

- **argon2id** for password hashing (via `argon2` npm package — a vetted
  implementation, not custom code).
- **JWT access + refresh tokens**, signed with a rotating secret
  (`jose`/`@nestjs/jwt`, a maintained library, not hand-rolled signing).
- A standard **NestJS Guard** pipeline (`JwtAuthGuard` → `RolesGuard`,
  §4 below), which is the well-trodden pattern for this framework, not a
  custom auth layer.

If/when the product needs social login, SSO, or consumer-scale auth
(owner-mobile at real scale), re-evaluate adopting a managed provider
(e.g. Auth0/Clerk/Ory) — tracked as an open question, not decided now,
because it's not needed for a single-garage-pilot MVP and would add an
external dependency before there's a concrete requirement for it.

## 2. Identity model

- `User` — one row per human platform identity. Has `email` and/or `phone`
  (at least one required), `passwordHash`, `createdAt`.
- `StaffMember` — `User` × `Garage` × `Role`. A `User` authenticates once;
  their `StaffMember` rows determine what garage(s) and role(s) they act
  under. The active `organizationId`/`garageId` is embedded in the JWT at
  login (or re-selected if a user somehow has staff rows at multiple
  garages — not a target scenario in MVP, but not structurally prevented).
- Owner identity (`OwnerProfile`, Phase 10) reuses the same `User` table —
  a person can in principle be both staff at a garage and an owner of a
  vehicle, without two accounts.

## 3. Roles (MVP)

| Role | Scope | Summary |
|---|---|---|
| `OWNER` | Garage | Full access to their garage's data: staff, customers, vehicles, jobs, estimates, invoices, payments, dashboard. |
| `MANAGER` | Garage | Same operational access as `OWNER` minus staff/garage-settings management (exact split is a garage-level convenience distinction, not a hard security boundary — both are trusted staff roles). |
| `FRONT_DESK` | Garage | Intake, customers, vehicles, job creation, estimate creation/sending, approvals logging, payments. Full read access to jobs. No staff management. |
| `TECHNICIAN` | Garage | Read access to jobs assigned to them (and, per `OPEN_QUESTIONS.md`, possibly all open jobs — TBD). Can write diagnosis, job status updates, parts/labor consumed, attachments. **No** access to pricing/estimate amounts, invoices, payments, or other staff's assignments, unless the garage explicitly elects to expose pricing (see `OPEN_QUESTIONS.md` — deferred toggle, not built in MVP; default is hidden). |
| `PLATFORM_ADMIN` | Global | Le Garage internal staff. Cross-tenant read for support/moderation, platform configuration. Never used for normal garage operations. Heavily audit-logged. |

Vehicle owners (Phase 10) are **not** a `Role` on `StaffMember` — they are a
separate authorization path scoped to "vehicles/jobs this owner is linked
to," enforced by ownership/linkage checks, not the garage RBAC table.

## 4. Authorization enforcement

Every protected endpoint answers, server-side: **who is allowed to perform
this action on this resource?**

1. `JwtAuthGuard` — validates the JWT, attaches `req.user` (`userId`, and
   for staff tokens, `organizationId`, `garageId`, `staffMemberId`, `role`).
2. Tenant scoping — **not a separate guard.** Every service method takes
   `organizationId` as an explicit parameter (read from `req.user` via the
   `@CurrentUser()` decorator in the controller) and passes it into every
   Prisma query; a Prisma Client Extension mechanically enforces that the
   parameter is actually present in the query's `where` clause (see
   `SECURITY.md` §2 for why this ended up simpler than the originally
   planned `TenantGuard` approach, and just as strict). A resource
   belonging to another tenant → `404`, not `403` (§6 below — avoid
   confirming existence of another tenant's resource).
3. `RolesGuard` — declarative `@Roles(Role.OWNER, Role.MANAGER)` decorator
   per route; rejects otherwise.
4. Service-layer checks for anything guards can't express declaratively
   (e.g. "a technician can only write to jobs assigned to them" — see
   `OPEN_QUESTIONS.md` for whether that restriction is enforced or just a
   UI default in MVP).

**Never trust frontend authorization.** `garage-web` hiding a button is a UX
nicety; the API re-checks role/tenant on every request regardless of what
the client sent or omitted.

## 5. Tokens

- **Access token:** short-lived (15 min), carries `sub` (userId),
  `organizationId`, `garageId`, `role`, `jti`.
- **Refresh token:** longer-lived (30 days), stored hashed server-side
  (`RefreshToken` table: `userId`, `tokenHash`, `expiresAt`, `revokedAt?`),
  rotated on every use (old one revoked, new one issued) — standard
  rotation-detects-reuse pattern to catch stolen refresh tokens.
- Access tokens are **not** stored server-side (stateless verification);
  revocation of an active session is achieved by revoking the refresh token
  family and accepting that a stolen access token remains valid for at most
  15 minutes — an explicit, documented tradeoff appropriate for MVP scale.
- Transport: `Authorization: Bearer` header. No cookies in MVP (garage-web
  and owner-mobile both hold the token client-side) — revisit if/when CSRF-
  relevant cookie auth is actually needed.

## 6. IDOR/BOLA defaults

- Resource lookups are always scoped: `findFirst({ where: { id, organizationId } })`,
  never `findUnique({ where: { id } })` alone, for any tenant-scoped model.
- A resource that exists but belongs to another tenant returns `404`, to
  avoid leaking existence.
- Sequential-looking IDs are never used for anything (UUIDs everywhere,
  `DATABASE.md` §1) — not a substitute for authorization checks, but removes
  trivial enumeration as an attack vector.

## 7. Owner-app auth (Phase 10, specified now so the model doesn't block it)

Phone-number-first (matches Ethiopian market norms, `ETHIOPIA.md`), OTP via
SMS for verification, same `User`/JWT infrastructure. Linking an owner
identity to existing garage-created `Customer` records happens by matched
phone number, with the match surfaced for confirmation rather than
auto-merged silently (a garage could have a typo'd or reused phone number on
file) — exact UX deferred to Phase 10 design.

## 8. Admin auth

`PLATFORM_ADMIN` accounts are provisioned manually (seed script / direct DB
action by a Le Garage engineer), not self-service signup. Every admin action
is audit-logged with no exceptions (`SECURITY.md` §Auditability).
