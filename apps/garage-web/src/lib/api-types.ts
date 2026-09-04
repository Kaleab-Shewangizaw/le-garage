import type {
  ApprovalDecision,
  ApprovalMethod,
  EstimateItemType,
  EstimateStatus,
  InvoiceStatus,
  JobStatus,
  PartCondition,
  PartSource,
  PaymentMethod,
  Role,
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
  customer: Customer;
  assignedTechnicianId: string | null;
  assignedTechnician: (StaffMember & { user: { fullName: string } }) | null;
}

export interface Job extends JobListItem {
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
