"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, Users } from "lucide-react";
import { useInviteStaff, useStaff, useUpdateStaff } from "@/hooks/use-staff";
import { useAuth } from "@/hooks/use-auth";
import { InitialsAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { humanizeApiError } from "@/lib/api-error";
import { useIsFleet } from "@/hooks/use-org";
import { FLEET_ROLE_LABEL } from "@/lib/job-labels";

const GARAGE_ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  FRONT_DESK: "Front desk",
  TECHNICIAN: "Technician",
};

/** What each fleet role is for (docs/FLEET.md §5) — shown so an owner knows whom to give which role. */
const FLEET_ROLE_HELP: Record<string, string> = {
  OWNER: "Holds the account. Sees everything, manages the team and settings, can approve anything.",
  MANAGER: "Runs day-to-day operations: approves repair costs, sees reports, adds and manages employees.",
  FRONT_DESK: "Creates service requests, works with garages, records estimates, bills and payments.",
  TECHNICIAN: "In-house mechanic: inspects vehicles, records findings and work done. No costs approval or reports.",
};

/** Roles the current user may hand out — only an owner can appoint an owner (StaffService). */
function assignableRoles(labels: Record<string, string>, actorRole: string | undefined) {
  return Object.entries(labels).filter(([value]) => value !== "OWNER" || actorRole === "OWNER");
}

export default function TeamPage() {
  const { user, me } = useAuth();
  const isFleet = useIsFleet();
  const ROLE_LABEL = isFleet ? FLEET_ROLE_LABEL : GARAGE_ROLE_LABEL;
  const staff = useStaff();
  const updateStaff = useUpdateStaff();
  const canManage = me?.staffMember && ["OWNER", "MANAGER"].includes(me.staffMember.role);
  const actorRole = me?.staffMember?.role;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Team</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">Everyone with access to this {isFleet ? "account" : "garage"}.</p>
        </div>
        {canManage && <InviteStaffDialog />}
      </div>

      {isFleet && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(FLEET_ROLE_LABEL).map(([role, label]) => (
            <div key={role} className="rounded-lg border border-line bg-surface p-3">
              <p className="text-[13px] font-medium text-ink">{label}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-graphite">{FLEET_ROLE_HELP[role]}</p>
            </div>
          ))}
        </div>
      )}

      {staff.isLoading ? (
        <SkeletonRows count={4} />
      ) : (staff.data ?? []).length === 0 ? (
        <EmptyState icon={Users} title="No staff yet" />
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {staff.data!.map((member) => (
            <div key={member.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <InitialsAvatar name={member.user.fullName} className="h-8 w-8 text-[12px]" />
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{member.user.fullName}</p>
                  <p className="text-[12px] text-graphite">{member.user.email ?? member.user.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!member.active && <Badge tone="attention">Inactive</Badge>}
                {canManage && member.userId !== user?.sub && (member.role !== "OWNER" || actorRole === "OWNER") ? (
                  <Select
                    value={member.role}
                    onValueChange={(role) => {
                      updateStaff.mutate(
                        { staffId: member.id, input: { role: role as never } },
                        {
                          onSuccess: () => toast.success(`${member.user.fullName} is now ${ROLE_LABEL[role]}`),
                          onError: (err) => toast.error("Couldn't update role", { description: humanizeApiError(err) }),
                        },
                      );
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles(ROLE_LABEL, actorRole).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-[13px] text-graphite">{ROLE_LABEL[member.role] ?? member.role}</span>
                )}
                {canManage && member.userId !== user?.sub && (member.role !== "OWNER" || actorRole === "OWNER") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={member.active ? "text-danger" : undefined}
                    onClick={() =>
                      updateStaff.mutate(
                        { staffId: member.id, input: { active: !member.active } },
                        {
                          onSuccess: () => toast.success(member.active ? `${member.user.fullName} can no longer sign in` : `${member.user.fullName} reactivated`),
                          onError: (err) => toast.error("Couldn't update access", { description: humanizeApiError(err) }),
                        },
                      )
                    }
                  >
                    {member.active ? "Deactivate" : "Reactivate"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InviteStaffDialog() {
  const isFleet = useIsFleet();
  const ROLE_LABEL = isFleet ? FLEET_ROLE_LABEL : GARAGE_ROLE_LABEL;
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("TECHNICIAN");
  const [password, setPassword] = useState("");
  const invite = useInviteStaff();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({ fullName, email, role: role as never, temporaryPassword: password });
      toast.success(`${fullName} added to the team`, { description: `Share the temporary password with them: ${password}` });
      setOpen(false);
      setFullName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      toast.error("Couldn't invite staff", { description: humanizeApiError(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-3.5 w-3.5" /> Add team member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles(ROLE_LABEL, me?.staffMember?.role).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isFleet && FLEET_ROLE_HELP[role] && <p className="text-[11.5px] leading-snug text-graphite">{FLEET_ROLE_HELP[role]}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Temporary password</Label>
            <Input id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending} disabled={!fullName || !email || password.length < 8}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
