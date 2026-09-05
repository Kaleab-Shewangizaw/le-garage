"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * A poor Ethiopian mobile connection dropping mid-workflow should never
 * feel catastrophic (docs/UX.md, brief §5 "network resilience") — the
 * first, cheapest thing that helps is just telling the user plainly that
 * they're offline, rather than letting requests silently fail. Mutations
 * still surface their own errors via toast; this is the ambient signal.
 */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-signal px-4 py-1.5 text-[12.5px] font-medium text-paper">
      <WifiOff className="h-3.5 w-3.5" />
      You&apos;re offline — changes won&apos;t save until your connection comes back.
    </div>
  );
}
