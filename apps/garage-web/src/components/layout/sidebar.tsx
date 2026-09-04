"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Wrench, Users, Car, UserCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/vehicles", label: "Vehicles", icon: Car },
  { href: "/team", label: "Team", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Deliberately six items (brief §9 — "do not expose 25 modules").
 * Everything else (estimates, invoices, parts) lives inside a job, reached
 * contextually, not as its own top-level module.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-line px-5">
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-[11px] font-semibold text-paper">
          LG
        </div>
        <span className="text-[14px] font-semibold text-ink">Le Garage</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
                active ? "bg-ink text-paper" : "text-graphite hover:bg-black/[0.04] hover:text-ink",
              )}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden">
      {NAV_ITEMS.slice(0, 5).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium",
              active ? "text-ink" : "text-muted",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
