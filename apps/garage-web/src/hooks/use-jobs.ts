import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignServiceProviderInput,
  AssignTechnicianInput,
  CreateApprovalInput,
  CreateDiagnosisInput,
  CreateEstimateInput,
  CreateJobInput,
  CreateJobLaborInput,
  CreateJobNoteInput,
  CreateJobPartInput,
  GenerateInvoiceInput,
  RecordPaymentInput,
  UpdateJobLaborInput,
  UpdateJobPartInput,
  UpdateJobStatusInput,
} from "@le-garage/validation";
import type { JobStatus } from "@le-garage/types";
import { api } from "@/lib/api-client";
import type { Approval, Diagnosis, Estimate, Invoice, Job, JobLabor, JobListItem, JobNote, JobPart, JobStatusEvent, Payment } from "@/lib/api-types";

export interface JobFilters {
  status?: JobStatus;
  search?: string;
  mine?: boolean;
  assignedTechnicianId?: string;
}

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: ["jobs", filters],
    queryFn: () =>
      api.get<JobListItem[]>("/jobs", {
        status: filters.status,
        search: filters.search,
        mine: filters.mine,
        assignedTechnicianId: filters.assignedTechnicianId,
      }),
  });
}

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => api.get<Job>(`/jobs/${jobId}`),
    enabled: !!jobId,
  });
}

export function useJobEvents(jobId: string | undefined) {
  return useQuery({
    queryKey: ["jobs", jobId, "events"],
    queryFn: () => api.get<JobStatusEvent[]>(`/jobs/${jobId}/events`),
    enabled: !!jobId,
  });
}

function useInvalidateJob(jobId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
    queryClient.invalidateQueries({ queryKey: ["jobs"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    // Fleet: a repair moving changes vehicle availability and report figures.
    queryClient.invalidateQueries({ queryKey: ["vehicles"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
  };
}

export function useCreateJob(idempotencyKey?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => api.post<Job>("/jobs", input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["customers"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["vehicles"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
    },
  });
}

export function useTransitionJobStatus(jobId: string, idempotencyKey?: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: UpdateJobStatusInput) => api.patch<Job>(`/jobs/${jobId}/status`, input, idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useAssignTechnician(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: AssignTechnicianInput) => api.patch<Job>(`/jobs/${jobId}/assign`, input),
    onSuccess: invalidate,
  });
}

export function useAssignServiceProvider(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: AssignServiceProviderInput) => api.patch<Job>(`/jobs/${jobId}/service-provider`, input),
    onSuccess: invalidate,
  });
}

export function useAddDiagnosis(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: CreateDiagnosisInput) => api.post<Diagnosis>(`/jobs/${jobId}/diagnoses`, input),
    onSuccess: invalidate,
  });
}

export function useAddJobNote(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: CreateJobNoteInput) => api.post<JobNote>(`/jobs/${jobId}/notes`, input),
    onSuccess: invalidate,
  });
}

export function useCreateEstimateDraft(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: CreateEstimateInput) => api.post<Estimate>(`/jobs/${jobId}/estimates`, input),
    onSuccess: invalidate,
  });
}

export function useSendEstimate(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (estimateId: string) => api.post<Estimate>(`/jobs/${jobId}/estimates/${estimateId}/send`),
    onSuccess: invalidate,
  });
}

export function useRecordApproval(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: ({ estimateId, input }: { estimateId: string; input: CreateApprovalInput }) =>
      api.post<Approval>(`/estimates/${estimateId}/approvals`, input),
    onSuccess: invalidate,
  });
}

export function useAddPart(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: CreateJobPartInput) => api.post<JobPart>(`/jobs/${jobId}/parts`, input),
    onSuccess: invalidate,
  });
}

export function useUpdatePart(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: ({ partId, input }: { partId: string; input: UpdateJobPartInput }) =>
      api.patch<JobPart>(`/jobs/${jobId}/parts/${partId}`, input),
    onSuccess: invalidate,
  });
}

export function useRemovePart(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (partId: string) => api.delete(`/jobs/${jobId}/parts/${partId}`),
    onSuccess: invalidate,
  });
}

export function useAddLabor(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: CreateJobLaborInput) => api.post<JobLabor>(`/jobs/${jobId}/labor`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLabor(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: ({ laborId, input }: { laborId: string; input: UpdateJobLaborInput }) =>
      api.patch<JobLabor>(`/jobs/${jobId}/labor/${laborId}`, input),
    onSuccess: invalidate,
  });
}

export function useRemoveLabor(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (laborId: string) => api.delete(`/jobs/${jobId}/labor/${laborId}`),
    onSuccess: invalidate,
  });
}

export function useGenerateInvoice(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: GenerateInvoiceInput) => api.post<Invoice>(`/jobs/${jobId}/invoices`, input),
    onSuccess: invalidate,
  });
}

export function useIssueInvoice(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (invoiceId: string) => api.post<Invoice>(`/jobs/${jobId}/invoices/${invoiceId}/issue`),
    onSuccess: invalidate,
  });
}

export function useVoidInvoice(jobId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason: string }) =>
      api.post<Invoice>(`/jobs/${jobId}/invoices/${invoiceId}/void`, { reason }),
    onSuccess: invalidate,
  });
}

export function useRecordPayment(jobId: string, invoiceId: string, idempotencyKey?: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => api.post<Payment>(`/invoices/${invoiceId}/payments`, input, idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useVoidPayment(jobId: string, invoiceId: string) {
  const invalidate = useInvalidateJob(jobId);
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      api.post<Payment>(`/invoices/${invoiceId}/payments/${paymentId}/void`, { reason }),
    onSuccess: invalidate,
  });
}

export function useShareEstimate(jobId: string) {
  return useMutation({
    mutationFn: (estimateId: string) => api.post<{ shareToken: string }>(`/jobs/${jobId}/estimates/${estimateId}/share`),
  });
}
