export interface OwnerMe {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  createdAt: string;
}

export interface ActiveJobSummary {
  id: string;
  status: string;
  garageName: string | null;
}

export interface OwnerVehicleListItem {
  id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  licensePlate: string;
  lastKnownMileage: number | null;
  activeJob: ActiveJobSummary | null;
}

export interface ServiceHistoryEntry {
  id: string;
  jobId: string;
  serviceDate: string;
  mileage: number | null;
  garageName: string | null;
  summary: {
    complaint?: string;
    diagnoses?: { observedProblem: string; confirmedCause?: string | null; recommendedRepair?: string | null; severity?: string | null; createdAt: string }[];
    workPerformed?: {
      parts?: { name: string; partNumber?: string | null; brand?: string | null; condition?: string; quantity: number; warrantyMonths?: number | null }[];
      labor?: { description: string; hours?: number | null }[];
    };
    estimateApproved?: { version: number; total: number; items: { description: string; type: string }[] } | null;
    invoice?: { total: number; currency: string; amountPaid: number; balance: number } | null;
    warrantyMonths?: number | null;
  };
}

export interface OwnerVehicleDetail extends Omit<OwnerVehicleListItem, "activeJob"> {
  vin: string | null;
  owner: { fullName: string; phone: string } | null;
  activeJob: ActiveJobSummary | null;
  serviceHistory: ServiceHistoryEntry[];
}

export interface EstimateItem {
  id: string;
  type: "PART" | "LABOR";
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface OwnerEstimate {
  id: string;
  jobId: string;
  version: number;
  status: "DRAFT" | "SENT" | "SUPERSEDED" | "APPROVED" | "REJECTED";
  currency: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  sentAt: string | null;
  decidedAt: string | null;
  items: EstimateItem[];
}

export interface ApprovalItemDecision {
  id: string;
  estimateItemId: string;
  decision: "APPROVED" | "REJECTED";
}

export interface OwnerApproval {
  id: string;
  estimateId: string;
  method: string;
  note: string | null;
  createdAt: string;
  itemDecisions: ApprovalItemDecision[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface OwnerPayment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
}

export interface OwnerInvoice {
  id: string;
  version: number;
  status: "DRAFT" | "ISSUED" | "VOID";
  currency: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  issuedAt: string | null;
  items: InvoiceItem[];
  payments: OwnerPayment[];
}

export interface OwnerAttachment {
  id: string;
  entityType: string;
  mimeType: string;
  createdAt: string;
}

export interface OwnerDiagnosis {
  id: string;
  observedProblem: string;
  confirmedCause: string | null;
  recommendedRepair: string | null;
  severity: string | null;
  createdAt: string;
}

export interface OwnerJob {
  id: string;
  status:
    | "INTAKE"
    | "DIAGNOSING"
    | "WAITING_APPROVAL"
    | "APPROVED"
    | "WAITING_PARTS"
    | "IN_PROGRESS"
    | "QUALITY_CHECK"
    | "READY"
    | "COLLECTED"
    | "ON_HOLD"
    | "CANCELLED"
    | "CLOSED";
  complaint: string;
  mileageAtIntake: number | null;
  intakeAt: string;
  diagnosingAt: string | null;
  waitingApprovalAt: string | null;
  approvedAt: string | null;
  inProgressAt: string | null;
  qualityCheckAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  vehicle: { id: string; make: string; model: string; year: number | null; licensePlate: string };
  organization: { garage: { name: string; phone: string | null } | null };
  assignedTechnician: { user: { fullName: string } } | null;
  diagnoses: OwnerDiagnosis[];
  estimates: OwnerEstimate[];
  approvals: OwnerApproval[];
  invoices: OwnerInvoice[];
  attachments: OwnerAttachment[];
}

export interface CustomerMatch {
  customerId: string;
  organizationId: string;
  customerFullName: string;
  garageName: string;
}

export interface CustomerLink extends CustomerMatch {
  linkedAt: string;
}

export interface OwnerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: { jobId?: string } | null;
  readAt: string | null;
  createdAt: string;
}
