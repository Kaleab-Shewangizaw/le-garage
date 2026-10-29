"use client";

import { use, useEffect } from "react";
import { Printer } from "lucide-react";
import { useJob } from "@/hooks/use-jobs";
import { useGarage } from "@/hooks/use-garage";
import { formatDate, formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

/**
 * A clean, physical-handoff-ready invoice (brief §21 "printable ... invoice
 * if already appropriate") — no sidebar, no nav, just the document. Staff
 * open this from the Job Detail invoice tab and print or save as PDF from
 * the browser's own print dialog; the "Print" button itself is hidden in
 * the printed output.
 */
export default function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useJob(id);
  const garage = useGarage();

  useEffect(() => {
    document.title = "Invoice";
  }, []);

  if (job.isLoading || garage.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const invoice = job.data?.invoices.find((inv) => inv.status === "ISSUED") ?? job.data?.invoices[0];

  if (!job.data || !invoice) {
    return <p className="p-10 text-[13.5px] text-graphite">No invoice has been issued for this job yet.</p>;
  }

  const amountPaid = invoice.payments.filter((p) => !p.voidedAt).reduce((sum, p) => sum + p.amount, 0);
  const balance = invoice.total - amountPaid;

  return (
    <div className="min-h-dvh bg-white text-ink">
      <div className="print:hidden sticky top-0 flex justify-end border-b border-line bg-paper px-6 py-3">
        <Button onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
      </div>

      <div className="mx-auto max-w-2xl px-10 py-10">
        <div className="flex items-start justify-between border-b border-ink pb-6">
          <div>
            <h1 className="text-[20px] font-semibold">{garage.data?.name}</h1>
            {garage.data?.address && <p className="mt-1 text-[12.5px] text-graphite">{garage.data.address}</p>}
            {garage.data?.phone && <p className="text-[12.5px] text-graphite">{garage.data.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-[15px] font-semibold uppercase tracking-wide">Invoice</p>
            <p className="mt-1 font-mono text-[12.5px] text-graphite">
              #{invoice.id.slice(0, 8).toUpperCase()} · v{invoice.version}
            </p>
            <p className="font-mono text-[12.5px] text-graphite">{invoice.issuedAt ? formatDate(invoice.issuedAt) : formatDate(invoice.createdAt)}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            {job.data.customer ? (
              <>
                <p className="eyebrow mb-1">Billed to</p>
                <p className="text-[13.5px] font-medium">{job.data.customer.fullName}</p>
                <p className="font-mono text-[12.5px] text-graphite">{job.data.customer.phone}</p>
              </>
            ) : (
              <>
                <p className="eyebrow mb-1">Service provider</p>
                <p className="text-[13.5px] font-medium">{job.data.serviceProvider?.name ?? "Not recorded"}</p>
                {job.data.serviceProvider?.phone && (
                  <p className="font-mono text-[12.5px] text-graphite">{job.data.serviceProvider.phone}</p>
                )}
              </>
            )}
          </div>
          <div>
            <p className="eyebrow mb-1">Vehicle</p>
            <p className="text-[13.5px] font-medium">
              {job.data.vehicle.make} {job.data.vehicle.model} {job.data.vehicle.year ? `(${job.data.vehicle.year})` : ""}
            </p>
            <p className="font-mono text-[12.5px] text-graphite">{job.data.vehicle.licensePlate}</p>
          </div>
        </div>

        <table className="mt-8 w-full text-[13px]">
          <thead>
            <tr className="border-b border-ink text-left text-[11px] font-medium uppercase tracking-wide text-graphite">
              <th className="pb-2">Description</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Unit price</th>
              <th className="pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-line">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right font-mono">{item.quantity}</td>
                <td className="py-2 text-right font-mono">{formatMoney(item.unitPrice, invoice.currency)}</td>
                <td className="py-2 text-right font-mono font-medium">{formatMoney(item.lineTotal, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-4 w-full max-w-[240px] space-y-1.5 text-[13px]">
          <div className="flex justify-between text-graphite">
            <span>Subtotal</span>
            <span className="font-mono">{formatMoney(invoice.subtotal, invoice.currency)}</span>
          </div>
          {invoice.taxTotal > 0 && (
            <div className="flex justify-between text-graphite">
              <span>Tax</span>
              <span className="font-mono">{formatMoney(invoice.taxTotal, invoice.currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-ink pt-1.5 text-[15px] font-semibold">
            <span>Total</span>
            <span className="font-mono">{formatMoney(invoice.total, invoice.currency)}</span>
          </div>
          <div className="flex justify-between text-graphite">
            <span>Paid</span>
            <span className="font-mono">{formatMoney(amountPaid, invoice.currency)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Balance due</span>
            <span className="font-mono">{formatMoney(balance, invoice.currency)}</span>
          </div>
        </div>

        <p className="mt-12 text-center text-[11px] text-muted">Thank you for your business.</p>
      </div>
    </div>
  );
}
