/** Mirrors the API's structured error shape (docs/API.md §1). */
export class ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  status: number;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Turns a backend error code / status into a short, human sentence that
 * explains what happened and, where possible, what to do next
 * (docs/UX.md §"Error UX" — never a raw status code or stack trace).
 */
export function humanizeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "INVALID_CREDENTIALS":
        return "That email/phone or password isn't right. Double-check and try again.";
      case "VALIDATION_ERROR":
        return "Some of the information entered isn't valid — check the highlighted fields.";
      case "JOB_INVALID_TRANSITION":
      case "FORBIDDEN_TRANSITION":
        return "This job can't move to that stage right now.";
      case "ESTIMATE_REQUIRED":
        return "Send an estimate before requesting approval.";
      case "APPROVAL_REQUIRED":
        return "At least one approved item is needed before marking this job approved.";
      case "INVOICE_REQUIRED":
        return "Issue an invoice before marking the vehicle collected.";
      case "JOB_ALREADY_INVOICED":
        return "This job already has an issued invoice — void it first to change parts or labor.";
      case "PAYMENT_EXCEEDS_BALANCE":
        return "That amount is more than what's still owed on this invoice.";
      case "INVOICE_HAS_PAYMENTS":
        return "This invoice has payments recorded — void those first.";
      default:
        if (error.status === 401) return "Your session has expired. Please sign in again.";
        if (error.status === 403) return "You don't have permission to do that.";
        if (error.status === 404) return "That couldn't be found.";
        if (error.status >= 500) return "Something went wrong on our end. Please try again.";
        return error.message || "Something went wrong.";
    }
  }
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    return error.message;
  }
  return "Something went wrong.";
}
