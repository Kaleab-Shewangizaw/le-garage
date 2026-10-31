/**
 * Shared cross-app types. Domain enums are re-exported from
 * @le-garage/database (the Prisma-generated source of truth, DECISIONS.md
 * ADR-0002) rather than re-declared here, so there is exactly one place
 * that defines "what a Role is."
 */
export {
  Role,
  JobStatus,
  EstimateStatus,
  EstimateItemType,
  ApprovalMethod,
  ApprovalDecision,
  PartCondition,
  PartSource,
  InvoiceStatus,
  PaymentMethod,
  AttachmentEntityType,
  Currency,
  OrganizationKind,
  VehicleStatus,
  VehicleType,
  FuelType,
  AttachmentTag,
} from "@le-garage/database";

/** Decoded JWT access token payload for a garage-staff session (garage-web). */
export interface AccessTokenPayload {
  sub: string; // userId
  organizationId: string;
  garageId: string;
  staffMemberId: string;
  role: string;
  jti: string;
  iat?: number;
  exp?: number;
}

/**
 * Decoded JWT access token payload for a vehicle-owner session
 * (owner-mobile). Deliberately has no organizationId/garageId/role: an
 * owner isn't scoped to one tenant, and is signed with a *different*
 * secret than AccessTokenPayload (docs/DECISIONS.md ADR-0020) so the two
 * token kinds can never be confused for one another, not even by a guard
 * bug — see OwnerJwtAuthGuard vs. JwtAuthGuard.
 */
export interface OwnerAccessTokenPayload {
  sub: string; // userId
  jti: string;
  iat?: number;
  exp?: number;
}

/** Structured error body — see docs/API.md §1. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

/** Job state-machine transition table shape, shared by API and any client that wants to pre-validate. */
export interface JobTransitionRule {
  from: string;
  to: string;
  allowedRoles: string[];
}
