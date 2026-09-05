import { applyDecorators, UseInterceptors } from "@nestjs/common";
import { IdempotencyInterceptor } from "../interceptors/idempotency.interceptor";

/**
 * Marks a mutation route as safe to deduplicate via an `Idempotency-Key`
 * request header (see IdempotencyInterceptor doc comment). Apply only to
 * routes where a duplicate call would be a real problem — job creation,
 * estimate send, approval, invoice issuance, payment recording, job status
 * transitions.
 */
export function Idempotent() {
  return applyDecorators(UseInterceptors(IdempotencyInterceptor));
}
