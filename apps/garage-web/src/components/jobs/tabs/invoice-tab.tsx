"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, FileText, Receipt } from "lucide-react";
import type { Invoice, Job } from "@/lib/api-types";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/status-pill";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatMoney, formatDateTime } from "@/lib/format";
import { useGenerateInvoice, useIssueInvoice, useVoidInvoice, useRecordPayment } from "@/hooks/use-jobs";
import { useAuth } from "@/hooks/use-auth";
import { humanizeApiError } from "@/lib/api-error";

const INVOICE_STATUS_TONE: Record<string, "neutral" | "attention" | "good" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "attention",
  VOID: "danger",
};

export function InvoiceTab({ job }: { job: Job }) {
  const { me } = useAuth();
  const isFrontOffice = me?.staffMember && ["OWNER", "MANAGER", "FRONT_DESK"].includes(me.staffMember.role);
  const canVoid = me?.staffMember && ["OWNER", "MANAGER"].includes(me.staffMember.role);

  const latest = job.invoices[0] as Invoice | undefined;
  const generate = useGenerateInvoice(job.id);
  const issue = useIssueInvoice(job.id);
  const [voidOpen, setVoidOpen] = useState(false);

  const hasWork = job.parts.length > 0 || job.labor.length > 0;

  async function handleGenerate() {
    try {
      await generate.mutateAsync({ taxTotal: 0, discountTotal: 0 });
      toast.success(latest ? "Invoice updated" : "Invoice drafted", { description: "Generated from recorded parts and labor." });
    } catch (err) {
      toast.error("Couldn't generate the invoice", { description: humanizeApiError(err) });
    }
  }

  if (!latest || latest.status === "VOID") {
    return (
      <div className="space-y-8">
        {latest?.status === "VOID" && (
          <div className="rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            The previous invoice (version {latest.version}) was voided.
          </div>
        )}
        {!hasWork ? (
          <EmptyState icon={Receipt} title="Nothing to invoice yet" description="Add parts or labor to this job first, then generate an invoice from them." />
        ) : (
          <EmptyState
            icon={FileText}
            title="No invoice yet"
            description="Generate one from the parts and labor recorded on this job."
            action={
              isFrontOffice && (
                <Button onClick={handleGenerate} loading={generate.isPending}>
                  Generate invoice
                </Button>
              )
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Section
        title={`Invoice · version ${latest.version}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={INVOICE_STATUS_TONE[latest.status]}>{latest.status}</Badge>
            {latest.status === "DRAFT" && isFrontOffice && (
              <>
                <Button size="sm" variant="secondary" onClick={handleGenerate} loading={generate.isPending}>
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await issue.mutateAsync(latest.id);
                      toast.success("Invoice issued");
                    } catch (err) {
                      toast.error("Couldn't issue the invoice", { description: humanizeApiError(err) });
                    }
                  }}
                  loading={issue.isPending}
                >
                  Issue invoice
                </Button>
              </>
            )}
            {latest.status === "ISSUED" && canVoid && (
              <Button size="sm" variant="secondary" className="text-danger" onClick={() => setVoidOpen(true)}>
                Void
              </Button>
            )}
          </div>
        }
      >
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-[13px]">
            <tbody>
              {latest.items.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5 text-ink">{item.description}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-graphite">{item.quantity > 1 ? `×${item.quantity}` : ""}</td>
                  <td className="w-28 px-3 py-2.5 text-right font-mono font-medium text-ink">{formatMoney(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-3 w-full max-w-[220px] space-y-1 text-[12.5px]">
          <div className="flex justify-between text-graphite">
            <span>Subtotal</span>
            <span className="font-mono">{formatMoney(latest.subtotal, latest.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1 text-[13.5px] font-semibold text-ink">
            <span>Total</span>
            <span className="font-mono">{formatMoney(latest.total, latest.currency)}</span>
          </div>
        </div>
      </Section>

      {latest.status === "ISSUED" && <PaymentsSection job={job} invoice={latest} isFrontOffice={!!isFrontOffice} />}

      <VoidDialog job={job} invoice={latest} open={voidOpen} onOpenChange={setVoidOpen} />
    </div>
  );
}

function PaymentsSection({ job, invoice, isFrontOffice }: { job: Job; invoice: Invoice; isFrontOffice: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "TELEBIRR" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [reference, setReference] = useState("");
  const recordPayment = useRecordPayment(job.id, invoice.id);

  const activePayments = invoice.payments.filter((p) => !p.voidedAt);
  const amountPaid = activePayments.reduce((sum, p) => sum + p.amount, 0);
  const balance = invoice.total - amountPaid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    try {
      await recordPayment.mutateAsync({ amount: Math.round(Number(amount) * 100), method, reference: reference || undefined });
      toast.success(`${formatMoney(Math.round(Number(amount) * 100))} recorded`);
      setAmount("");
      setReference("");
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't record the payment", { description: humanizeApiError(err) });
    }
  }

  return (
    <Section
      title="Payments"
      action={
        balance > 0 &&
        isFrontOffice && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
            <CreditCard className="h-3.5 w-3.5" /> Record payment
          </Button>
        )
      }
    >
      <div className="flex items-center justify-between rounded-md bg-paper px-4 py-3">
        <span className="text-[13px] text-graphite">Outstanding balance</span>
        <span className={`font-mono text-[15px] font-semibold ${balance > 0 ? "text-signal" : "text-good"}`}>{formatMoney(balance, invoice.currency)}</span>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-3.5 sm:grid-cols-4">
          <Input placeholder={`Amount (max ${(balance / 100).toFixed(2)})`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" autoFocus />
          <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="TELEBIRR">Telebirr</SelectItem>
              <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Button type="submit" loading={recordPayment.isPending} disabled={!amount}>
            Save
          </Button>
        </form>
      )}

      {activePayments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" />
      ) : (
        <div className="divide-y divide-line rounded-md border border-line">
          {activePayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
              <div>
                <p className="text-ink">{p.method.replace("_", " ").toLowerCase()}</p>
                {p.reference && <p className="text-[11.5px] text-graphite">Ref: {p.reference}</p>}
              </div>
              <div className="text-right">
                <p className="font-mono font-medium text-ink">{formatMoney(p.amount, invoice.currency)}</p>
                <p className="font-mono text-[11px] text-muted">{formatDateTime(p.paidAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function VoidDialog({ job, invoice, open, onOpenChange }: { job: Job; invoice: Invoice; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("");
  const voidInvoice = useVoidInvoice(job.id);

  async function handleVoid() {
    if (!reason.trim()) return;
    try {
      await voidInvoice.mutateAsync({ invoiceId: invoice.id, reason });
      toast.success("Invoice voided");
      onOpenChange(false);
      setReason("");
    } catch (err) {
      toast.error("Couldn't void the invoice", { description: humanizeApiError(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this invoice?</DialogTitle>
          <DialogDescription>
            This can&apos;t be undone. If it has payments recorded, void those first. A new invoice can be generated afterward.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="void-reason">Reason</Label>
        <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus className="mt-1.5" />
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleVoid} loading={voidInvoice.isPending} disabled={!reason.trim()}>
            Void invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
