"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Truck } from "lucide-react";
import { useAcceptWorkOrder, useDeclineWorkOrder, useWorkOrders } from "@/hooks/use-work-orders";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-pill";
import { Label, Textarea } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorkOrderRow } from "@/lib/api-types";
import { VEHICLE_TYPE_LABEL } from "@/lib/job-labels";
import { formatMileage, formatRelativeTime } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";

const STATUS_TONE: Record<WorkOrderRow["status"], "attention" | "good" | "danger" | "neutral"> = {
  SENT: "attention",
  ACCEPTED: "good",
  DECLINED: "danger",
  CANCELLED: "neutral",
};
const STATUS_LABEL: Record<WorkOrderRow["status"], string> = {
  SENT: "Waiting for you",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELLED: "Cancelled by fleet",
};

/**
 * Repairs fleet companies have sent this garage (docs/WORK-ORDERS.md).
 * Accepting creates the garage's own job — filed under the fleet as a
 * customer — where the work happens as usual. The fleet approves the
 * estimate in its own account and sees progress as the job moves.
 */
export default function WorkOrdersPage() {
  const { me } = useAuth();
  const workOrders = useWorkOrders();
  const canRespond = me?.staffMember && ["OWNER", "MANAGER", "FRONT_DESK"].includes(me.staffMember.role);
  const mine = (workOrders.data ?? []).filter((w) => w.side === "GARAGE");
  const incoming = mine.filter((w) => w.status === "SENT");
  const answered = mine.filter((w) => w.status !== "SENT");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Work orders</h1>
        <p className="mt-0.5 text-[13.5px] text-graphite">Repairs sent to you by fleet companies on Le Garage. They approve your estimates and follow progress in their own account.</p>
      </div>

      {workOrders.isLoading ? (
        <SkeletonRows count={3} />
      ) : workOrders.isError ? (
        <EmptyState icon={Inbox} title="Couldn't load work orders" description={humanizeApiError(workOrders.error)} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="eyebrow">New ({incoming.length})</h2>
            {incoming.length === 0 ? (
              <EmptyState icon={Inbox} title="No new work orders" description="When a fleet company sends you a repair, it appears here — you'll also get an SMS and email." />
            ) : (
              incoming.map((w) => <IncomingCard key={w.id} workOrder={w} canRespond={!!canRespond} />)
            )}
          </section>

          {answered.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">Answered</h2>
              <div className="divide-y divide-line rounded-lg border border-line bg-surface">
                {answered.map((w) => (
                  <div key={w.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink">
                        <span className="font-mono">{w.vehicle.licensePlate}</span> {w.vehicle.make} {w.vehicle.model} · {w.fleetName}
                      </p>
                      <p className="truncate text-[12.5px] text-graphite">
                        {w.complaint}
                        {w.declineReason && ` — declined: ${w.declineReason}`}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[w.status]}>{STATUS_LABEL[w.status]}</Badge>
                    {w.jobId && (
                      <Link href={`/jobs/${w.jobId}`} className="shrink-0 text-[12.5px] font-medium text-graphite hover:text-ink">
                        Open job →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function IncomingCard({ workOrder: w, canRespond }: { workOrder: WorkOrderRow; canRespond: boolean }) {
  const router = useRouter();
  const accept = useAcceptWorkOrder();
  const decline = useDeclineWorkOrder();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  async function handleAccept() {
    try {
      const res = await accept.mutateAsync(w.id);
      toast.success("Work order accepted", { description: `A job was created for ${w.vehicle.licensePlate}. ${w.fleetName} has been told.` });
      router.push(`/jobs/${res.jobId}`);
    } catch (err) {
      toast.error("Couldn't accept", { description: humanizeApiError(err) });
    }
  }

  async function handleDecline() {
    try {
      await decline.mutateAsync({ id: w.id, input: { reason: reason.trim() } });
      toast.success("Work order declined", { description: `${w.fleetName} will see your reason.` });
      setDeclining(false);
    } catch (err) {
      toast.error("Couldn't decline", { description: humanizeApiError(err) });
    }
  }

  return (
    <div className="rounded-lg border border-signal/40 bg-surface p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 gap-3">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-signal" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-[12px] text-muted">
              From <span className="font-medium text-ink">{w.fleetName}</span> · {formatRelativeTime(w.sentAt)}
            </p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">
              <span className="font-mono">{w.vehicle.licensePlate}</span> {w.vehicle.make} {w.vehicle.model}
              {w.vehicle.year ? ` (${w.vehicle.year})` : ""}
            </p>
            <p className="text-[12px] text-graphite">
              {[w.vehicle.vehicleType && VEHICLE_TYPE_LABEL[w.vehicle.vehicleType], w.mileage != null && formatMileage(w.mileage)].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-2 text-[13.5px] text-ink">{w.complaint}</p>
            {w.message && <p className="mt-1 rounded-md bg-paper px-2.5 py-1.5 text-[12.5px] text-graphite">“{w.message}”</p>}
          </div>
        </div>
        {canRespond && (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setDeclining(true)}>
              Decline
            </Button>
            <Button onClick={handleAccept} loading={accept.isPending}>
              Accept
            </Button>
          </div>
        )}
      </div>

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this work order?</DialogTitle>
            <DialogDescription>{w.fleetName} will see your reason and can send it to another garage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`decline-${w.id}`}>Reason</Label>
            <Textarea id={`decline-${w.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fully booked until Monday" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDecline} loading={decline.isPending} disabled={reason.trim().length < 3}>
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
