"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Wrench, Users, Car, UserCircle, Settings, Building2, BarChart3, ShieldCheck, ScrollText, Inbox } from "lucide-react";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { cn } from "@/lib/utils";
import { useOrgKind } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";

const GARAGE_NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  // Repairs fleet companies send in (docs/WORK-ORDERS.md).
  { href: "/work-orders", label: "Work orders", icon: Inbox, badge: "incoming-work-orders", roles: ["OWNER", "MANAGER", "FRONT_DESK"] },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/vehicles", label: "Vehicles", icon: Car },
  { href: "/team", label: "Team", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Fleet companies (docs/FLEET.md) don't have customers — they have their
 * own vehicles, the garages they use, and the spend to answer for.
 * Reports only appear for the roles the API lets read them.
 */
const FLEET_NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/vehicles", label: "Vehicles", icon: Car },
  { href: "/jobs", label: "Repairs", icon: Wrench },
  { href: "/providers", label: "Providers", icon: Building2 },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["OWNER", "MANAGER"] },
  { href: "/team", label: "Team", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Le Garage staff (docs/ADMIN.md): the cross-tenant console, nothing tenant-operational. */
const PLATFORM_NAV_ITEMS = [
  { href: "/admin", label: "Platform", icon: ShieldCheck, exact: true },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

type NavItem = { href: string; label: string; icon: React.ElementType; roles?: string[]; exact?: boolean; badge?: string };

/** Count of work orders waiting for this garage to accept — the one nav badge. */
function useIncomingCount(enabled: boolean): number {
  const incoming = useWorkOrders("SENT", enabled);
  if (!enabled) return 0;
  return (incoming.data ?? []).filter((w) => w.side === "GARAGE").length;
}

function useNavItems(): NavItem[] {
  const kind = useOrgKind();
  const { me } = useAuth();
  // Render nothing until we know which product this is, rather than
  // flashing the garage navigation at a fleet user.
  if (!kind) return [];
  if (kind === "PLATFORM") return PLATFORM_NAV_ITEMS;
  const role = me?.staffMember?.role;
  if (kind === "GARAGE") return GARAGE_NAV_ITEMS.filter((item) => !("roles" in item) || (role && (item.roles as string[]).includes(role)));
  return FLEET_NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

/**
 * Deliberately six items (brief §9 — "do not expose 25 modules").
 * Everything else (estimates, invoices, parts) lives inside a job, reached
 * contextually, not as its own top-level module.
 */
export function Sidebar() {
  const pathname = usePathname();
  const navItems = useNavItems();
  const incoming = useIncomingCount(navItems.some((i) => i.badge));

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-line px-5">
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-[11px] font-semibold text-paper">
          LG
        </div>
        <span className="text-[14px] font-semibold text-ink">Le Garage</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map((item) => {
          const active = pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
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
              {item.badge && incoming > 0 && (
                <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-paper text-ink" : "bg-signal text-paper")}>{incoming}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const navItems = useNavItems();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden">
      {navItems.slice(0, 5).map((item) => {
        const active = pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
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
