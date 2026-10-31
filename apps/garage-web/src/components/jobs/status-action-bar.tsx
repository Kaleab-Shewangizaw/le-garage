"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import type { Job } from "@/lib/api-types";
import type { JobNextAction } from "@/lib/job-labels";
import { useJobLabels } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea, Label } from "@/components/ui/input";
import { useTransitionJobStatus } from "@/hooks/use-jobs";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { humanizeApiError } from "@/lib/api-error";

const SUCCESS_COPY: Partial<Record<string, string>> = {
  DIAGNOSING: "Job moved to diagnosis.",
  WAITING_APPROVAL: "Waiting on the customer's approval.",
  APPROVED: "Job marked approved — ready to start work.",
  IN_PROGRESS: "Repair started.",
  WAITING_PARTS: "Marked as waiting on parts.",
  QUALITY_CHECK: "Sent to quality check.",
  READY: "Marked ready — the customer can be notified it's ready for pickup.",
  COLLECTED: "Job complete. Service history has been saved to the vehicle.",
  ON_HOLD: "Job put on hold.",
  CANCELLED: "Job cancelled.",
};

const FLEET_SUCCESS_COPY: Partial<Record<string, string>> = {
  DIAGNOSING: "Inspection started.",
  WAITING_APPROVAL: "Submitted — waiting on a supervisor's approval.",
  IN_PROGRESS: "Repair started.",
  WAITING_PARTS: "Marked as waiting on parts.",
  QUALITY_CHECK: "Sent to quality check.",
  READY: "Repair marked complete.",
  COLLECTED: "Vehicle is back in service. This visit has been added to its profile.",
  ON_HOLD: "Repair put on hold.",
  CANCELLED: "Repair cancelled.",
};

export function StatusActionBar({ job }: { job: Job }) {
  const labels = useJobLabels();
  // Fleet: "Submit for approval" lives on the Estimate tab, where it sends
  // the estimate and advances the repair in one click. Offering the same
  // label here before an estimate is sent was a second, always-failing
  // button (the API requires a sent estimate) — only show it as a recovery
  // path once one has actually been sent.
  const actions = labels.nextActions[job.status].filter(
    (a) => !(labels.noun === "repair" && a.to === "WAITING_APPROVAL" && job.status === "DIAGNOSING" && job.estimates[0]?.status !== "SENT"),
  );
  const successCopy = labels.noun === "repair" ? FLEET_SUCCESS_COPY : SUCCESS_COPY;
  const idempotency = useIdempotencyKey();
  const transition = useTransitionJobStatus(job.id, idempotency.key);
  const [confirmAction, setConfirmAction] = useState<JobNextAction | null>(null);
  const [note, setNote] = useState("");

  if (actions.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-good-soft px-3 py-2 text-[13px] text-good">
        <CheckCircle2 className="h-4 w-4" />
        {labels.stage[job.status]}
      </div>
    );
  }

  async function run(action: JobNextAction, withNote?: string) {
    try {
      await transition.mutateAsync({ toStatus: action.to, note: withNote || undefined });
      toast.success(successCopy[action.to] ?? "Updated.");
      setConfirmAction(null);
      setNote("");
    } catch (err) {
      toast.error(`Couldn't update the ${labels.noun}`, { description: humanizeApiError(err) });
    } finally {
      // A fresh key per logical attempt: a same-tick double-click/retry
      // shares this key (deduped server-side), but the *next* deliberate
      // transition — success or failure — must not collide with this one.
      idempotency.rotate();
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.to}
            variant={action.primary ? "signal" : action.destructive ? "secondary" : "secondary"}
            className={action.destructive ? "text-danger hover:bg-danger-soft" : undefined}
            loading={transition.isPending && confirmAction === null}
            onClick={() => (action.confirm ? setConfirmAction(action) : run(action))}
          >
            {action.label}
          </Button>
        ))}
      </div>

      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.label}</DialogTitle>
            <DialogDescription>
              This moves the {labels.noun} to &ldquo;{confirmAction && labels.stage[confirmAction.to]}&rdquo;. You can add a note explaining why.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="transition-note">Note (optional)</Label>
            <Textarea id="transition-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.destructive ? "danger" : "primary"}
              loading={transition.isPending}
              onClick={() => confirmAction && run(confirmAction, note)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
