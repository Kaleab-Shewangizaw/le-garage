"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserCog } from "lucide-react";
import type { Job } from "@/lib/api-types";
import { JobTimeline } from "@/components/jobs/job-timeline";
import { StatusActionBar } from "@/components/jobs/status-action-bar";
import { InitialsAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatMileage } from "@/lib/format";
import { useAssignTechnician } from "@/hooks/use-jobs";
import { useStaff } from "@/hooks/use-staff";
import { useAuth } from "@/hooks/use-auth";
import { humanizeApiError } from "@/lib/api-error";

const FRONT_OFFICE_ROLES = new Set(["OWNER", "MANAGER", "FRONT_DESK"]);

export function JobDetailHeader({ job }: { job: Job }) {
  const { me } = useAuth();
  const canAssign = me?.staffMember && FRONT_OFFICE_ROLES.has(me.staffMember.role);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">
              {job.vehicle.make} {job.vehicle.model}
              {job.vehicle.year ? ` (${job.vehicle.year})` : ""}
            </h1>
            <span className="rounded-sm bg-black/[0.05] px-1.5 py-0.5 font-mono text-[12.5px] font-medium text-ink">
              {job.vehicle.licensePlate}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-graphite">
            <span>{job.customer.fullName} · {job.customer.phone}</span>
            {job.vehicle.vin && <span className="font-mono">VIN {job.vehicle.vin}</span>}
            <span className="font-mono">{formatMileage(job.mileageAtIntake ?? job.vehicle.lastKnownMileage)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TechnicianAssignment job={job} canAssign={!!canAssign} />
          <StatusActionBar job={job} />
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <JobTimeline status={job.status} timestamps={job} />
      </div>
    </div>
  );
}

function TechnicianAssignment({ job, canAssign }: { job: Job; canAssign: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(job.assignedTechnicianId ?? undefined);
  const staff = useStaff();
  const assign = useAssignTechnician(job.id);

  const technicianName = job.assignedTechnician?.user.fullName;

  async function handleAssign() {
    if (!selected) return;
    try {
      await assign.mutateAsync({ staffMemberId: selected });
      toast.success(`Assigned to ${staff.data?.find((s) => s.id === selected)?.user.fullName ?? "technician"}`);
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't assign technician", { description: humanizeApiError(err) });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => canAssign && setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-left transition-colors hover:bg-paper disabled:cursor-default"
        disabled={!canAssign}
      >
        {technicianName ? (
          <InitialsAvatar name={technicianName} />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line text-muted">
            <UserCog className="h-3 w-3" />
          </span>
        )}
        <div className="leading-tight">
          <p className="text-[11px] text-muted">Technician</p>
          <p className="text-[12.5px] font-medium text-ink">{technicianName ?? "Unassigned"}</p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign technician</DialogTitle>
          </DialogHeader>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a technician" />
            </SelectTrigger>
            <SelectContent>
              {staff.data?.filter((s) => s.active).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.user.fullName} · {s.role.replace("_", " ").toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selected} loading={assign.isPending}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
