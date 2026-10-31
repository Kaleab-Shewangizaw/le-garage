"use client";

import { LogOut, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewJobSheet } from "@/components/jobs/new-job-sheet";
import { RequestServiceSheet } from "@/components/fleet/request-service-sheet";
import { useOrgKind } from "@/hooks/use-org";
import { FLEET_ROLE_LABEL } from "@/lib/job-labels";
import { NotificationBell } from "@/components/layout/notification-bell";

export function Topbar() {
  const { me, logout } = useAuth();
  const router = useRouter();

  const fullName = me?.user.fullName ?? "";
  const role = me?.staffMember?.role;
  const garageName = me?.staffMember?.garage?.name;
  const kind = useOrgKind();
  const roleLabel =
    role && (role === "PLATFORM_ADMIN" ? "Platform admin" : kind === "FLEET" ? FLEET_ROLE_LABEL[role] : role.replace("_", " ").toLowerCase());

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-medium text-ink">{garageName ?? " "}</p>
      </div>
      <div className="flex items-center gap-3">
        {/* The quick-create action is the org's own intake: a fleet reports a
            service request for its vehicle; a garage opens a job for a customer. */}
        {kind === "FLEET" && (
          <RequestServiceSheet
            trigger={
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                Request service
              </Button>
            }
          />
        )}
        {kind === "GARAGE" && (
          <NewJobSheet
            trigger={
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                New job
              </Button>
            }
          />
        )}
        {kind && kind !== "PLATFORM" && <NotificationBell />}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal">
            <InitialsAvatar name={fullName || "?"} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div>
                <p className="text-[13px] font-medium text-ink">{fullName}</p>
                {roleLabel && <p className="text-[11.5px] font-normal text-graphite">{roleLabel}</p>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await logout();
                router.push("/login");
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
