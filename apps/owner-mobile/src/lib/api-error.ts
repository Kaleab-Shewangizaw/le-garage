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
 * Turns a backend error code / status into a short, human sentence
 * (docs/OWNER-APP.md §"Error UX" — never a raw status code or stack
 * trace to a vehicle owner).
 */
export function humanizeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "INVALID_CREDENTIALS":
        return "That email/phone or password isn't right. Double-check and try again.";
      case "ACCOUNT_ALREADY_EXISTS":
        return "An account with this phone or email already exists — try signing in instead.";
      case "PHONE_DOES_NOT_MATCH":
        return "That record's phone number doesn't match your account.";
      case "CUSTOMER_NOT_FOUND":
      case "VEHICLE_NOT_FOUND":
      case "JOB_NOT_FOUND":
      case "ESTIMATE_NOT_FOUND":
        return "That couldn't be found.";
      case "VALIDATION_ERROR":
        return "Some of the information entered isn't valid.";
      default:
        if (error.status === 401) return "Your session has expired. Please sign in again.";
        if (error.status === 403) return "You don't have permission to do that.";
        if (error.status === 404) return "That couldn't be found.";
        if (error.status >= 500) return "Something went wrong on our end. Please try again.";
        return error.message || "Something went wrong.";
    }
  }
  if (error instanceof Error) {
    if (error.message.includes("Network request failed")) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    return error.message;
  }
  return "Something went wrong.";
}
