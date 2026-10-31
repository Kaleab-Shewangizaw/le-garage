"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, CheckCircle2, Clock, Send, Truck, XCircle } from "lucide-react";
import type { Job } from "@/lib/api-types";
import { useCancelWorkOrder, useSendWorkOrder } from "@/hooks/use-work-orders";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";

const FRONT_OFFICE = new Set(["OWNER", "MANAGER", "FRONT_DESK"]);

/**
 * Where a job stands between the two companies (docs/WORK-ORDERS.md). On a
 * fleet repair: send it to the connected garage, or see whether they've
 * accepted. On a garage job that came from a fleet: who it's for and that
 * they approve the estimate themselves.
 */
export function WorkOrderPanel({ job }: { job: Job }) {
  const { me } = useAuth();
  const canAct = !!me?.staffMember && FRONT_OFFICE.has(me.staffMember.role);
  const wo = job.workOrder;

  if (wo?.side === "GARAGE") {
    return (
      <Banner icon={Truck} tone="info">
        <span className="font-medium text-ink">Work order from {wo.partnerName}.</span> They approve your estimate in their own Le Garage account and see your
        progress, photos and invoice as you update this job.
        {wo.message && <span className="mt-1 block text-graphite">Their note: “{wo.message}”</span>}
      </Banner>
    );
  }

  if (wo?.side === "FLEET" && wo.status === "ACCEPTED") {
    return (
      <Banner icon={CheckCircle2} tone="good">
        <span className="font-medium text-ink">{wo.partnerName} accepted this repair</span>
        {wo.respondedAt && ` ${formatRelativeTime(wo.respondedAt)}`}. They post their findings, estimate, photos and progress here — your part is to approve or
        reject the estimate on the Estimate tab.
      </Banner>
    );
  }

  if (wo?.side === "FLEET" && wo.status === "SENT") {
    return <PendingBanner job={job} canAct={canAct} />;
  }

  const provider = job.serviceProvider;
  const canSend = canAct && !!provider?.garageOrganizationId && (job.status === "INTAKE" || job.status === "DIAGNOSING") && job.estimates.length === 0;
  if (!canSend && wo?.status !== "DECLINED") return null;

  return (
    <div className="space-y-2">
      {wo?.status === "DECLINED" && (
        <Banner icon={XCircle} tone="danger">
          <span className="font-medium text-ink">{wo.partnerName} declined</span>
          {wo.declineReason && `: “${wo.declineReason}”`}. Choose another provider, or send it again.
        </Banner>
      )}
      {canSend && provider && <SendBanner job={job} providerName={provider.name} />}
    </div>
  );
}

function SendBanner({ job, providerName }: { job: Job; providerName: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const send = useSendWorkOrder(job.id);

  async function handleSend() {
    try {
      await send.mutateAsync({ message: message.trim() || undefined });
      toast.success(`Sent to ${providerName}`, { description: "They've been notified by SMS, email and in the app." });
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't send the work order", { description: humanizeApiError(err) });
    }
  }

  return (
    <>
      <Banner icon={Building2} tone="info" action={<Button size="sm" onClick={() => setOpen(true)}><Send className="h-3.5 w-3.5" /> Send to {providerName}</Button>}>
        <span className="font-medium text-ink">{providerName} is on Le Garage.</span> Send them this request — they accept it, do the work in their own
        account, and you approve the estimate and follow progress here.
      </Banner>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to {providerName}</DialogTitle>
            <DialogDescription>They&apos;ll get an SMS, an email and an in-app notice with the vehicle and what it needs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="wo-message">Note for the garage (optional)</Label>
            <Textarea id="wo-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Driver will drop it off at 9am — needed back by Friday" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} loading={send.isPending}>
              Send work order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PendingBanner({ job, canAct }: { job: Job; canAct: boolean }) {
  const cancel = useCancelWorkOrder();
  const wo = job.workOrder!;
  return (
    <Banner
      icon={Clock}
      tone="attention"
      action={
        canAct && (
          <Button
            size="sm"
            variant="secondary"
            loading={cancel.isPending}
            onClick={async () => {
              try {
                await cancel.mutateAsync(wo.id);
                toast.success("Request withdrawn", { description: `${wo.partnerName} has been told.` });
              } catch (err) {
                toast.error("Couldn't withdraw", { description: humanizeApiError(err) });
              }
            }}
          >
            Withdraw
          </Button>
        )
      }
    >
      <span className="font-medium text-ink">Sent to {wo.partnerName}</span> {formatRelativeTime(wo.sentAt)} — waiting for them to accept.
    </Banner>
  );
}

const TONE = {
  info: "border-line bg-paper",
  good: "border-good/30 bg-good-soft",
  attention: "border-signal/30 bg-signal-soft",
  danger: "border-danger/30 bg-danger-soft",
};

function Banner({ icon: Icon, tone, action, children }: { icon: React.ElementType; tone: keyof typeof TONE; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-3 rounded-md border px-3.5 py-3 text-[13px] text-graphite sm:flex-row sm:items-center sm:justify-between ${TONE[tone]}`}>
      <div className="flex gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink" strokeWidth={1.75} />
        <p>{children}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
