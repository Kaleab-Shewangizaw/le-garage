"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lock, Plus, Trash2, Wrench, PackageCheck } from "lucide-react";
import { garageHandles } from "@/lib/work-orders";
import type { Job } from "@/lib/api-types";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";
import { useAddPart, useAddLabor, useRemovePart, useRemoveLabor } from "@/hooks/use-jobs";
import { useAuth } from "@/hooks/use-auth";
import { humanizeApiError } from "@/lib/api-error";

const FRONT_OFFICE_ROLES = new Set(["OWNER", "MANAGER", "FRONT_DESK"]);

export function PartsLaborTab({ job }: { job: Job }) {
  const handledByGarage = garageHandles(job);
  const isLocked = handledByGarage || job.invoices.some((inv) => inv.status === "ISSUED");

  return (
    <div className="space-y-8">
      {handledByGarage ? (
        <div className="flex items-center gap-2 rounded-md bg-paper px-3.5 py-2.5 text-[13px] text-graphite">
          <Lock className="h-3.5 w-3.5" />
          {job.workOrder?.partnerName} records the parts and labor on their side — you&apos;ll see them on the invoice they send.
        </div>
      ) : isLocked && (
        <div className="flex items-center gap-2 rounded-md bg-paper px-3.5 py-2.5 text-[13px] text-graphite">
          <Lock className="h-3.5 w-3.5" />
          Parts and labor are locked — this job has an issued invoice. Void it to make changes.
        </div>
      )}
      <PartsSection job={job} locked={isLocked} />
      <LaborSection job={job} locked={isLocked} />
    </div>
  );
}

function PartsSection({ job, locked }: { job: Job; locked: boolean }) {
  const { me } = useAuth();
  const canManage = me?.staffMember && FRONT_OFFICE_ROLES.has(me.staffMember.role);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const addPart = useAddPart(job.id);
  const removePart = useRemovePart(job.id);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unitPrice) return;
    try {
      await addPart.mutateAsync({
        name,
        partNumber: partNumber || undefined,
        brand: brand || undefined,
        quantity: Number(quantity) || 1,
        unitPrice: Math.round(Number(unitPrice) * 100),
      });
      setName("");
      setPartNumber("");
      setBrand("");
      setQuantity("1");
      setUnitPrice("");
      setOpen(false);
      toast.success("Part added");
    } catch (err) {
      toast.error("Couldn't add part", { description: humanizeApiError(err) });
    }
  }

  return (
    <Section
      title="Parts"
      action={
        !locked && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
            <Plus className="h-3.5 w-3.5" /> Add part
          </Button>
        )
      }
    >
      {open && (
        <form onSubmit={handleAdd} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-3.5 sm:grid-cols-5">
          <Input placeholder="Part name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-2 sm:col-span-2" autoFocus />
          <Input placeholder="Part number" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} className="font-mono" />
          <Input placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <div className="flex gap-2">
            <Input placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} className="w-16 font-mono" />
            <Input placeholder="ETB" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" />
          </div>
          <Button type="submit" size="sm" className="col-span-2 sm:col-span-5 sm:w-fit sm:justify-self-end" loading={addPart.isPending} disabled={!name.trim() || !unitPrice}>
            Add
          </Button>
        </form>
      )}

      {job.parts.length === 0 && !open ? (
        <EmptyState icon={PackageCheck} title="No parts recorded" description="Add parts as they're installed — this feeds directly into the invoice." />
      ) : (
        <LineItemTable
          rows={job.parts.map((p) => ({
            id: p.id,
            label: p.partNumber ? `${p.name} (${p.partNumber})` : p.name,
            sub: p.brand ?? undefined,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
          }))}
          onRemove={canManage && !locked ? (id) => removePart.mutate(id) : undefined}
        />
      )}
    </Section>
  );
}

function LaborSection({ job, locked }: { job: Job; locked: boolean }) {
  const { me } = useAuth();
  const canManage = me?.staffMember && FRONT_OFFICE_ROLES.has(me.staffMember.role);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [amount, setAmount] = useState("");
  const addLabor = useAddLabor(job.id);
  const removeLabor = useRemoveLabor(job.id);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    try {
      await addLabor.mutateAsync({
        description,
        hours: hours ? Number(hours) : undefined,
        amount: Math.round(Number(amount) * 100),
      });
      setDescription("");
      setHours("");
      setAmount("");
      setOpen(false);
      toast.success("Labor added");
    } catch (err) {
      toast.error("Couldn't add labor", { description: humanizeApiError(err) });
    }
  }

  return (
    <Section
      title="Labor"
      action={
        !locked && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
            <Plus className="h-3.5 w-3.5" /> Add labor
          </Button>
        )
      }
    >
      {open && (
        <form onSubmit={handleAdd} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-3.5 sm:grid-cols-4">
          <Input placeholder="What was done" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-2" autoFocus />
          <Input placeholder="Hours (optional)" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" />
          <Input placeholder="Amount (ETB)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" />
          <Button type="submit" size="sm" className="col-span-2 sm:col-span-4 sm:w-fit sm:justify-self-end" loading={addLabor.isPending} disabled={!description.trim() || !amount}>
            Add
          </Button>
        </form>
      )}

      {job.labor.length === 0 && !open ? (
        <EmptyState icon={Wrench} title="No labor recorded" description="Log work as it's completed." />
      ) : (
        <LineItemTable
          rows={job.labor.map((l) => ({
            id: l.id,
            label: l.description,
            sub: l.hours ? `${l.hours}h` : undefined,
            quantity: 1,
            unitPrice: l.amount,
          }))}
          onRemove={canManage && !locked ? (id) => removeLabor.mutate(id) : undefined}
        />
      )}
    </Section>
  );
}

function LineItemTable({
  rows,
  onRemove,
}: {
  rows: { id: string; label: string; sub?: string; quantity: number; unitPrice: number }[];
  onRemove?: (id: string) => void;
}) {
  const total = rows.reduce((sum, r) => sum + r.quantity * r.unitPrice, 0);
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2.5">
                <p className="text-ink">{row.label}</p>
                {row.sub && <p className="text-[11.5px] text-graphite">{row.sub}</p>}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-graphite">{row.quantity > 1 ? `×${row.quantity}` : ""}</td>
              <td className="w-28 px-3 py-2.5 text-right font-mono font-medium text-ink">{formatMoney(row.quantity * row.unitPrice)}</td>
              {onRemove && (
                <td className="w-8 px-2 py-2.5">
                  <button type="button" onClick={() => onRemove(row.id)} className="text-muted hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-2 text-[12px] font-medium text-graphite">Total</td>
            <td />
            <td className="px-3 py-2 text-right font-mono text-[13px] font-semibold text-ink">{formatMoney(total)}</td>
            {onRemove && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
