"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Link2, Plus, Send, Trash2 } from "lucide-react";
import type { Estimate, Job } from "@/lib/api-types";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/status-pill";
import { formatMoney, formatDateTime } from "@/lib/format";
import { useCreateEstimateDraft, useSendEstimate, useRecordApproval, useShareEstimate } from "@/hooks/use-jobs";
import { humanizeApiError } from "@/lib/api-error";

interface DraftItem {
  key: string;
  type: "PART" | "LABOR";
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

function blankItem(): DraftItem {
  return { key: crypto.randomUUID(), type: "PART", description: "", quantity: "1", unitPrice: "", discount: "0" };
}

const ESTIMATE_STATUS_TONE: Record<string, "neutral" | "attention" | "good" | "danger"> = {
  DRAFT: "neutral",
  SENT: "attention",
  APPROVED: "good",
  REJECTED: "danger",
  SUPERSEDED: "neutral",
};

export function EstimateTab({ job }: { job: Job }) {
  const latest = job.estimates[0] as Estimate | undefined;
  const [building, setBuilding] = useState(false);

  if (!latest || building) {
    return <EstimateBuilder job={job} seed={!building ? undefined : latest} onDone={() => setBuilding(false)} />;
  }

  return (
    <div className="space-y-8">
      <Section
        title={`Estimate · version ${latest.version}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={ESTIMATE_STATUS_TONE[latest.status]}>{latest.status}</Badge>
            {latest.status === "DRAFT" && (
              <Button size="sm" variant="secondary" onClick={() => setBuilding(true)}>
                Edit
              </Button>
            )}
            {(latest.status === "SENT" || latest.status === "APPROVED" || latest.status === "REJECTED") && (
              <Button size="sm" variant="secondary" onClick={() => setBuilding(true)}>
                New version
              </Button>
            )}
          </div>
        }
      >
        <EstimateItemsTable items={latest.items} />
        <EstimateTotals estimate={latest} />

        {latest.status === "DRAFT" && (
          <SendEstimateAction job={job} estimate={latest} />
        )}
        {latest.status !== "DRAFT" && <ShareEstimateAction job={job} estimate={latest} />}
        {latest.status === "SENT" && <ApprovalForm job={job} estimate={latest} />}
        {(latest.status === "APPROVED" || latest.status === "REJECTED") && <ApprovalSummary job={job} estimate={latest} />}
      </Section>

      {job.estimates.length > 1 && (
        <Section title="Earlier versions">
          <div className="space-y-2">
            {job.estimates.slice(1).map((e) => (
              <details key={e.id} className="rounded-md border border-line bg-surface">
                <summary className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 text-[13px]">
                  <span className="font-medium text-ink">Version {e.version}</span>
                  <span className="flex items-center gap-2 text-graphite">
                    <span className="font-mono">{formatMoney(e.total, e.currency)}</span>
                    <Badge tone={ESTIMATE_STATUS_TONE[e.status]}>{e.status}</Badge>
                  </span>
                </summary>
                <div className="border-t border-line p-3.5">
                  <EstimateItemsTable items={e.items} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function EstimateItemsTable({ items }: { items: Estimate["items"] }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line bg-paper text-left text-[11.5px] font-medium uppercase tracking-wide text-graphite">
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Unit price</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2 text-ink">
                {item.description}
                <span className="ml-1.5 text-[11px] text-muted">{item.type === "PART" ? "part" : "labor"}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-graphite">{item.quantity}</td>
              <td className="px-3 py-2 text-right font-mono text-graphite">{formatMoney(item.unitPrice)}</td>
              <td className="px-3 py-2 text-right font-mono font-medium text-ink">{formatMoney(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstimateTotals({ estimate }: { estimate: Pick<Estimate, "subtotal" | "discountTotal" | "taxTotal" | "total" | "currency"> }) {
  return (
    <div className="ml-auto mt-3 w-full max-w-[220px] space-y-1 text-[12.5px]">
      <div className="flex justify-between text-graphite">
        <span>Subtotal</span>
        <span className="font-mono">{formatMoney(estimate.subtotal, estimate.currency)}</span>
      </div>
      {estimate.discountTotal > 0 && (
        <div className="flex justify-between text-graphite">
          <span>Discount</span>
          <span className="font-mono">−{formatMoney(estimate.discountTotal, estimate.currency)}</span>
        </div>
      )}
      {estimate.taxTotal > 0 && (
        <div className="flex justify-between text-graphite">
          <span>Tax</span>
          <span className="font-mono">{formatMoney(estimate.taxTotal, estimate.currency)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-line pt-1 text-[13.5px] font-semibold text-ink">
        <span>Total</span>
        <span className="font-mono">{formatMoney(estimate.total, estimate.currency)}</span>
      </div>
    </div>
  );
}

function EstimateBuilder({ job, seed, onDone }: { job: Job; seed?: Estimate; onDone: () => void }) {
  const [items, setItems] = useState<DraftItem[]>(
    seed?.items.length
      ? seed.items.map((i) => ({
          key: crypto.randomUUID(),
          type: i.type,
          description: i.description,
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
          discount: String(i.discount),
        }))
      : [blankItem()],
  );
  const createDraft = useCreateEstimateDraft(job.id);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
    const discount = items.reduce((sum, i) => sum + (Number(i.discount) || 0), 0);
    return { subtotal, discount, total: subtotal - discount };
  }, [items]);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  const validItems = items.filter((i) => i.description.trim() && Number(i.unitPrice) >= 0);

  async function handleSave() {
    try {
      await createDraft.mutateAsync({
        items: validItems.map((i) => ({
          type: i.type,
          description: i.description,
          quantity: Number(i.quantity) || 1,
          unitPrice: Math.round(Number(i.unitPrice) * 100),
          discount: Math.round((Number(i.discount) || 0) * 100),
        })),
        taxTotal: 0,
      });
      toast.success("Estimate saved");
      onDone();
    } catch (err) {
      toast.error("Couldn't save the estimate", { description: humanizeApiError(err) });
    }
  }

  return (
    <Section
      title={seed ? `New estimate (from version ${seed.version})` : "Create estimate"}
      action={
        job.estimates.length > 0 && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )
      }
    >
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex flex-wrap items-start gap-2 rounded-md border border-line bg-surface p-2.5">
            {/* Description gets the full row on narrow screens — it's the
                field that actually matters; squeezing it to a sliver
                alongside four other controls made it unusable on a phone
                (brief §12). Type/qty/price/delete share a second row. */}
            <Input
              placeholder="Description — e.g. Front brake pads"
              value={item.description}
              onChange={(e) => updateItem(item.key, { description: e.target.value })}
              className="w-full sm:flex-1"
            />
            <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-1">
              <Select value={item.type} onValueChange={(v) => updateItem(item.key, { type: v as "PART" | "LABOR" })}>
                <SelectTrigger className="w-[92px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PART">Part</SelectItem>
                  <SelectItem value="LABOR">Labor</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(item.key, { quantity: e.target.value.replace(/[^\d]/g, "") })}
                className="w-14 shrink-0 text-right font-mono"
              />
              <Input
                placeholder="Price (ETB)"
                value={item.unitPrice}
                onChange={(e) => updateItem(item.key, { unitPrice: e.target.value.replace(/[^\d.]/g, "") })}
                className="min-w-0 flex-1 text-right font-mono sm:w-28 sm:flex-none"
              />
              <button
                type="button"
                onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== item.key) : prev))}
                className="shrink-0 text-muted hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setItems((prev) => [...prev, blankItem()])}>
          <Plus className="h-3.5 w-3.5" /> Add line
        </Button>
      </div>

      <div className="ml-auto mt-3 w-full max-w-[220px] space-y-1 text-[12.5px]">
        <div className="flex justify-between border-t border-line pt-1 text-[13.5px] font-semibold text-ink">
          <span>Total</span>
          <span className="font-mono">{formatMoney(Math.round(totals.total * 100))}</span>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} loading={createDraft.isPending} disabled={validItems.length === 0}>
          <FileText className="h-3.5 w-3.5" />
          Save draft estimate
        </Button>
      </div>
    </Section>
  );
}

function SendEstimateAction({ job, estimate }: { job: Job; estimate: Estimate }) {
  const send = useSendEstimate(job.id);
  return (
    <div className="mt-4 flex items-center justify-between rounded-md bg-paper px-3.5 py-3">
      <p className="text-[12.5px] text-graphite">Sending freezes this version — further changes create a new one.</p>
      <Button
        size="sm"
        onClick={async () => {
          try {
            await send.mutateAsync(estimate.id);
            toast.success("Estimate sent", { description: "The customer can now review and approve it." });
          } catch (err) {
            toast.error("Couldn't send the estimate", { description: humanizeApiError(err) });
          }
        }}
        loading={send.isPending}
      >
        <Send className="h-3.5 w-3.5" /> Send estimate
      </Button>
    </div>
  );
}

function ShareEstimateAction({ job, estimate }: { job: Job; estimate: Estimate }) {
  const share = useShareEstimate(job.id);

  async function handleShare() {
    try {
      const { shareToken } = await share.mutateAsync(estimate.id);
      const url = `${window.location.origin}/estimate/${shareToken}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Send it to the customer over WhatsApp, Telegram, or SMS." });
    } catch (err) {
      toast.error("Couldn't create a share link", { description: humanizeApiError(err) });
    }
  }

  return (
    <div className="mt-2 flex items-center justify-between rounded-md bg-paper px-3.5 py-3">
      <p className="text-[12.5px] text-graphite">Let the customer see this estimate on their own phone — no account needed.</p>
      <Button size="sm" variant="secondary" onClick={handleShare} loading={share.isPending}>
        <Link2 className="h-3.5 w-3.5" /> Copy customer link
      </Button>
    </div>
  );
}

function ApprovalForm({ job, estimate }: { job: Job; estimate: Estimate }) {
  const [decisions, setDecisions] = useState<Record<string, "APPROVED" | "REJECTED">>(
    Object.fromEntries(estimate.items.map((i) => [i.id, "APPROVED" as const])),
  );
  const [method, setMethod] = useState<"IN_APP" | "VERBAL_LOGGED_BY_STAFF" | "PHONE">("VERBAL_LOGGED_BY_STAFF");
  const [note, setNote] = useState("");
  const recordApproval = useRecordApproval(job.id);

  async function handleSubmit() {
    try {
      await recordApproval.mutateAsync({
        estimateId: estimate.id,
        input: {
          method,
          note: note || undefined,
          itemDecisions: Object.entries(decisions).map(([estimateItemId, decision]) => ({ estimateItemId, decision })),
        },
      });
      toast.success("Approval recorded");
      setNote("");
    } catch (err) {
      toast.error("Couldn't record the approval", { description: humanizeApiError(err) });
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-line bg-paper p-3.5">
      <p className="eyebrow">Record the customer&apos;s decision</p>
      <div className="space-y-1.5">
        {estimate.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-sm bg-surface px-3 py-2">
            <span className="text-[13px] text-ink">{item.description}</span>
            <div className="flex gap-1">
              {(["APPROVED", "REJECTED"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecisions((prev) => ({ ...prev, [item.id]: d }))}
                  className={`rounded-sm px-2 py-1 text-[11.5px] font-medium transition-colors ${
                    decisions[item.id] === d
                      ? d === "APPROVED"
                        ? "bg-good text-paper"
                        : "bg-danger text-paper"
                      : "bg-black/[0.04] text-graphite hover:bg-black/[0.08]"
                  }`}
                >
                  {d === "APPROVED" ? "Approve" : "Reject"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="w-44 space-y-1">
          <Label>How was this approved?</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VERBAL_LOGGED_BY_STAFF">By phone (logged)</SelectItem>
              <SelectItem value="PHONE">Phone call</SelectItem>
              <SelectItem value="IN_APP">In the owner app</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input placeholder="Note — e.g. spoke with Jane, she approved" value={note} onChange={(e) => setNote(e.target.value)} className="flex-1" />
        <Button onClick={handleSubmit} loading={recordApproval.isPending}>
          Save decision
        </Button>
      </div>
    </div>
  );
}

function ApprovalSummary({ job, estimate }: { job: Job; estimate: Estimate }) {
  const relevant = job.approvals.filter((a) => a.estimateId === estimate.id);
  if (relevant.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {relevant.map((a) => (
        <div key={a.id} className="rounded-md bg-paper px-3.5 py-2.5 text-[12.5px]">
          <p className="text-graphite">
            {a.method === "IN_APP" ? "Approved in the owner app" : "Logged by staff"} · {formatDateTime(a.createdAt)}
          </p>
          {a.note && <p className="mt-0.5 text-ink">&ldquo;{a.note}&rdquo;</p>}
        </div>
      ))}
    </div>
  );
}
