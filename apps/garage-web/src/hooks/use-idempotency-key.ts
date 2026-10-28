import { useRef } from "react";

/**
 * A stable key for the lifetime of one "logical attempt" at a mutation —
 * shared across retries of the *same* click/submit (protecting against a
 * double-click or a network retry firing the request twice), but rotated
 * after success so the next deliberate action gets a fresh one (docs/API.md
 * §1, brief "duplicate action protection"). Pairs with
 * IdempotencyInterceptor on the API side.
 *
 * The `react-hooks/refs` lint rule flags reading `.current` in the
 * returned object below, but `key` is never rendered to JSX — it's only
 * ever threaded through to a mutation hook, read at submit time inside an
 * event handler. A ref (not state) is the right primitive here
 * specifically because rotating it must NOT trigger a re-render.
 */
export function useIdempotencyKey() {
  const keyRef = useRef<string | undefined>(undefined);
  if (keyRef.current == null) {
    keyRef.current = crypto.randomUUID();
  }

  /* eslint-disable react-hooks/refs */
  return {
    key: keyRef.current,
    rotate: () => {
      keyRef.current = crypto.randomUUID();
    },
  };
  /* eslint-enable react-hooks/refs */
}
