"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * A poor Ethiopian mobile connection dropping mid-workflow should never
 * feel catastrophic (docs/UX.md, brief §5 "network resilience") — the
 * first, cheapest thing that helps is just telling the user plainly that
 * they're offline, rather than letting requests silently fail. Mutations
 * still surface their own errors via toast; this is the ambient signal.
 *
 * `useSyncExternalStore` (not useState+useEffect) is the correct primitive
 * for reading browser-owned mutable state like `navigator.onLine` — it
 * reads the current value directly rather than syncing it into state via
 * an effect, and the SSR snapshot avoids a `navigator` reference during
 * server rendering.
 */
export function ConnectionBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-signal px-4 py-1.5 text-[12.5px] font-medium text-paper">
      <WifiOff className="h-3.5 w-3.5" />
      You&apos;re offline — changes won&apos;t save until your connection comes back.
    </div>
  );
}
