"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useStaffNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from "@/hooks/use-notifications";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * In-app notices (work orders, estimates waiting, repair progress). The same
 * notices also go out by SMS/email — see StaffNotificationsService for how
 * delivery works today.
 */
export function NotificationBell() {
  const notifications = useStaffNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-graphite transition-colors hover:bg-black/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-semibold text-paper">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="text-[13px] font-semibold text-ink">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={() => markAll.mutate()} className="text-[12px] font-medium text-graphite hover:text-ink">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-graphite">Nothing yet.</p>
          ) : (
            items.map((n) => (
              // A real menu item, so choosing a notice closes the menu (instead of leaving it over the page).
              <DropdownMenuItem key={n.id} asChild className="block cursor-pointer rounded-none p-0 focus:bg-black/[0.03]">
                <Link
                  href={n.payload?.href ?? "#"}
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                  className={cn("block border-b border-line px-3 py-2.5 last:border-0", !n.readAt && "bg-signal-soft/40")}
                >
                  <p className={cn("text-[12.5px] text-ink", !n.readAt && "font-semibold")}>{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-graphite">{n.body}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-muted">{formatRelativeTime(n.createdAt)}</p>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
