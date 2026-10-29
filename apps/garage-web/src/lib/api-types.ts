import type {
  AttachmentTag,
  FuelType,
  ApprovalDecision,
  ApprovalMethod,
  AttachmentEntityType,
  EstimateItemType,
  EstimateStatus,
  InvoiceStatus,
  JobStatus,
  OrganizationKind,
  PartCondition,
  PartSource,
  PaymentMethod,
  Role,
  VehicleStatus,
  VehicleType,
} from "@le-garage/types";

/**
 * Response shapes returned by apps/api (docs/API.md). Hand-maintained
 * (not generated) — kept close to what each endpoint actually includes,
 * not a 1:1 mirror of the Prisma schema.
 */

export interface Garage {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  address: string | null;
  city: string;
  verifiedAt: string | null;
}

export interface Organization {
  id: string;
  name: string;
  kind: OrganizationKind;
}

export interface StaffUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface StaffMember {
  id: string;
  organizationId: string;
  garageId: string;
  userId: string;
  role: Role;
  active: boolean;
  createdAt: string;
  user?: StaffUser;
  garage?: Garage;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  vin: string | null;
  licensePlate: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  lastKnownMileage: number | null;
  vehicleType: VehicleType | null;
  status: VehicleStatus;
  fuelType: FuelType | null;
  acquiredAt: string | null;
  driverName: string | null;
  driverPhone: string | null;
  notes: string | null;
  createdAt: string;
}

/** An external garage in a fleet organization's private directory (docs/FLEET.md). */
export interface ServiceProvider {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  /** Set when this provider is a garage on Le Garage — repairs can be sent to it as work orders. */
  garageOrganizationId: string | null;
  createdAt: string;
}

/** GET /service-providers/directory — garages on Le Garage a fleet can connect to. */
export interface DirectoryGarage {
  organizationId: string;
  name: string;
  city: string | null;
  phone: string | null;
  address: string | null;
  /** Already in the caller's providers (and under which id). */
  serviceProviderId: string | null;
}

export type WorkOrderStatus = "SENT" | "ACCEPTED" | "DECLINED" | "CANCELLED";

/** The work order linking a job to the other company, from the caller's side (docs/WORK-ORDERS.md). */
export interface JobWorkOrder {
  id: string;
  status: WorkOrderStatus;
  side: "FLEET" | "GARAGE";
  partnerName: string;
  message: string | null;
  declineReason: string | null;
  sentAt: string;
  respondedAt: string | null;
}

/** GET /work-orders */
export interface WorkOrderRow {
  id: string;
  status: WorkOrderStatus;
  side: "FLEET" | "GARAGE";
  fleetName: string;
  garageName: string;
  message: string | null;
  declineReason: string | null;
  sentAt: string;
  respondedAt: string | null;
  complaint: string;
  mileage: number | null;
  vehicle: { licensePlate: string; make: string; model: string; year: number | null; vehicleType: VehicleType | null };
  /** The caller's own job for this work order, if there is one. */
  jobId: string | null;
}

export interface StaffNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: { href?: string | null } | null;
  readAt: string | null;
  createdAt: string;
}

export interface JobStatusEvent {
  id: string;
  jobId: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  actorUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface Diagnosis {
  id: string;
  jobId: string;
  authorStaffId: string;
  observedProblem: string;
  suspectedCause: string | null;
  confirmedCause: string | null;
  severity: string | null;
  recommendedRepair: string | null;
  notes: string | null;
  createdAt: string;
}

export interface JobNote {
  id: string;
  jobId: string;
  authorStaffId: string;
  note: string;
  createdAt: string;
}

export interface EstimateItem {
  id: string;
  estimateId: string;
  type: EstimateItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface Estimate {
  id: string;
  jobId: string;
  version: number;
  status: EstimateStatus;
  currency: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  createdByStaffId: string;
  createdAt: string;
  sentAt: string | null;
  decidedAt: string | null;
  items: EstimateItem[];
}

export interface ApprovalItemDecision {
  id: string;
  estimateItemId: string;
  decision: ApprovalDecision;
}

export interface Approval {
  id: string;
  jobId: string;
  estimateId: string;
  method: ApprovalMethod;
  note: string | null;
  createdAt: string;
  itemDecisions: ApprovalItemDecision[];
  decidedByStaffId: string | null;
  /** The supervisor/owner who made a STAFF_DECISION approval. */
  decidedByStaff?: { id: string; role: Role; user: { fullName: string } } | null;
}

export interface JobPart {
  id: string;
  jobId: string;
  name: string;
  partNumber: string | null;
  brand: string | null;
  condition: PartCondition;
  source: PartSource;
  supplier: string | null;
  quantity: number;
  unitCost: number | null;
  unitPrice: number;
  warrantyMonths: number | null;
  createdAt: string;
}

export interface JobLabor {
  id: string;
  jobId: string;
  description: string;
  technicianStaffId: string | null;
  hours: number | null;
  rate: number | null;
  amount: number;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  voidedAt: string | null;
  recordedByStaffId: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  version: number;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  issuedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  items: InvoiceItem[];
  payments: Payment[];
  amountPaid?: number;
  balance?: number;
}

export interface JobListItem {
  id: string;
  organizationId: string;
  status: JobStatus;
  complaint: string;
  mileageAtIntake: number | null;
  intakeAt: string;
  readyAt: string | null;
  collectedAt: string | null;
  vehicle: Vehicle;
  /** Null for fleet repairs — the organization owns the vehicle. */
  customer: Customer | null;
  serviceProviderId: string | null;
  serviceProvider: ServiceProvider | null;
  assignedTechnicianId: string | null;
  assignedTechnician: (StaffMember & { user: { fullName: string } }) | null;
}

export interface Job extends JobListItem {
  workOrder: JobWorkOrder | null;
  diagnosingAt: string | null;
  waitingApprovalAt: string | null;
  approvedAt: string | null;
  inProgressAt: string | null;
  qualityCheckAt: string | null;
  cancelledAt: string | null;
  diagnoses: Diagnosis[];
  notes: JobNote[];
  estimates: Estimate[];
  approvals: Approval[];
  parts: JobPart[];
  labor: JobLabor[];
  invoices: Invoice[];
}

export interface DashboardSummary {
  countsByStatus: Partial<Record<JobStatus, number>>;
  vehiclesCurrentlyInGarage: number;
  jobsIntakenToday: number;
  jobsCollectedToday: number;
  jobsAwaitingApproval: number;
  jobsBlockedOnParts: number;
  outstandingBalance: number;
}

export interface ServiceRecord {
  id: string;
  jobId: string;
  vehicleId: string;
  serviceDate: string;
  mileage: number | null;
  summary: {
    complaint: string;
    diagnoses: { observedProblem: string; confirmedCause: string | null; recommendedRepair: string | null; severity: string | null; createdAt: string }[];
    notes: { note: string; createdAt: string }[];
    workPerformed: {
      parts: { name: string; partNumber: string | null; brand: string | null; condition: string; quantity: number; warrantyMonths: number | null }[];
      labor: { description: string; hours: number | null }[];
    };
    estimateApproved: { version: number; total: number; items: { description: string; type: string }[] } | null;
    invoice: { total: number; currency: string; amountPaid: number; balance: number } | null;
    warrantyMonths: number | null;
  };
}

export interface Attachment {
  id: string;
  entityType: AttachmentEntityType;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByStaffId: string;
  tag: AttachmentTag | null;
  caption: string | null;
  createdAt: string;
}

/** GET /vehicles/:id/visits — one entry per time the vehicle went in for service. */
export interface VehicleVisit {
  id: string;
  status: JobStatus;
  complaint: string;
  mileageAtIntake: number | null;
  intakeAt: string;
  readyAt: string | null;
  collectedAt: string | null;
  cancelledAt: string | null;
  serviceProvider: { id: string; name: string } | null;
  diagnoses: { observedProblem: string; severity: string | null; recommendedRepair: string | null }[];
  estimateTotal: number | null;
  invoiceTotal: number | null;
  amountPaid: number | null;
  attachments: Attachment[];
}

/** GET /reports/fleet-summary — amounts in santim. */
export interface FleetSummary {
  vehiclesByStatus: Partial<Record<VehicleStatus, number>>;
  openRepairs: number;
  awaitingApproval: {
    jobId: string;
    complaint: string;
    waitingSince: string | null;
    vehicle: Pick<Vehicle, "id" | "licensePlate" | "make" | "model">;
    serviceProvider: { id: string; name: string } | null;
    estimateTotal: number | null;
  }[];
  outOfService: {
    vehicle: Pick<Vehicle, "id" | "licensePlate" | "make" | "model" | "status">;
    openRepair: { id: string; status: JobStatus; complaint: string; intakeAt: string } | null;
  }[];
  spendThisMonth: number;
  outstandingBalance: number;
}

/** GET /reports/spend — amounts in santim; every figure from recorded invoices/timestamps. */
export interface SpendReport {
  from: string;
  to: string;
  currency: string;
  totals: {
    invoicedTotal: number;
    paidTotal: number;
    outstandingTotal: number;
    byCategory: { parts: number; labor: number; uncategorized: number; tax: number; discount: number };
    invoiceCount: number;
    completedRepairs: number;
    averageTurnaroundHours: number | null;
  };
  byProvider: { serviceProviderId: string | null; name: string; invoicedTotal: number; invoices: number }[];
  perVehicle: {
    vehicleId: string;
    vehicle: Pick<Vehicle, "id" | "licensePlate" | "make" | "model" | "vehicleType" | "status">;
    repairsOpened: number;
    invoicedTotal: number;
    paidTotal: number;
    partsTotal: number;
    laborTotal: number;
    downtimeHours: number;
  }[];
  truncated: boolean;
}

// ─── Platform admin console (docs/ADMIN.md) ───

export interface AdminOverview {
  organizationsByKind: Partial<Record<OrganizationKind, number>>;
  suspendedOrganizations: number;
  users: number;
  vehicles: number;
  openJobs: number;
  recentOrganizations: { id: string; name: string; kind: OrganizationKind; createdAt: string; suspendedAt: string | null }[];
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  kind: OrganizationKind;
  createdAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  garage: { phone: string | null; city: string } | null;
  staffCount: number;
  vehicleCount: number;
  openJobs: number;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actorUser: { fullName: string; email?: string | null } | null;
  organization?: { id: string; name: string; kind: OrganizationKind } | null;
}

export interface AdminOrganizationDetail extends Omit<AdminOrganizationRow, "staffCount" | "vehicleCount" | "garage"> {
  garage: Garage | null;
  staff: (StaffMember & { user: StaffUser & { createdAt: string } })[];
  _count: { vehicles: number; customers: number; serviceProviders: number; jobs: number };
  openJobs: number;
  recentActivity: AdminAuditEntry[];
}
