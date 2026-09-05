import { useRef } from "react";

/**
 * A stable key for the lifetime of one "logical attempt" at a mutation —
 * shared across retries of the *same* click/submit (protecting against a
 * double-click or a network retry firing the request twice), but rotated
 * after success so the next deliberate action gets a fresh one (docs/API.md
 * §1, brief "duplicate action protection"). Pairs with
 * IdempotencyInterceptor on the API side.
 */
export function useIdempotencyKey() {
  const keyRef = useRef<string | undefined>(undefined);
  if (!keyRef.current) keyRef.current = crypto.randomUUID();

  return {
    key: keyRef.current,
    rotate: () => {
      keyRef.current = crypto.randomUUID();
    },
  };
}
