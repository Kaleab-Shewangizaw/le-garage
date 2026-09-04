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
} from "@le-garage/database";

/** Decoded JWT access token payload, shared shape between issuer and any verifier. */
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
