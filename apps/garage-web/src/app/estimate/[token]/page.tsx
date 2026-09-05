"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Phone } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

interface PublicEstimateItem {
  id: string;
  type: "PART" | "LABOR";
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface PublicEstimate {
  version: number;
  status: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  sentAt: string | null;
  items: PublicEstimateItem[];
  job: {
    complaint: string;
    vehicle: { make: string; model: string; year: number | null; licensePlate: string };
    customer: { fullName: string };
    garage: { name: string; phone: string | null };
  };
}

/**
 * The one page in this app a customer opens with no account
 * (docs/PRODUCT.md §"Customer Approval Experience", brief §21/§24) —
 * calm, mobile-first, and legible without any automotive vocabulary.
 * Approval itself is still logged by garage staff (docs/AUTH.md §7); this
 * is the "see what they're being asked to approve" half of that trust
 * moment, sent over WhatsApp/Telegram/SMS rather than requiring a login.
 */
export default function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const query = useQuery({
    queryKey: ["public-estimate", token],
    queryFn: () => api.get<PublicEstimate>(`/public/estimates/${token}`),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-5 py-10">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-16 text-center">
        <AlertTriangle className="mb-3 h-6 w-6 text-graphite" strokeWidth={1.5} />
        <p className="text-[14px] font-medium text-ink">This link isn&apos;t valid</p>
        <p className="mt-1 text-[13px] text-graphite">It may have expired, or the address was typed incorrectly. Contact your garage for a new link.</p>
      </div>
    );
  }

  const estimate = query.data;
  const { vehicle, customer, garage } = estimate.job;

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-md px-5 py-8">
        <div className="mb-6 text-center">
          <p className="text-[13px] font-medium text-graphite">{garage.name}</p>
          <h1 className="mt-1 text-[19px] font-semibold tracking-tight text-ink">Estimate for your vehicle</h1>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-[14px] font-medium text-ink">
            {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""}
          </p>
          <p className="font-mono text-[12.5px] text-graphite">{vehicle.licensePlate}</p>
          <p className="mt-2 text-[12px] text-muted">For {customer.fullName}</p>
        </div>

        <div className="mt-5">
          <p className="eyebrow mb-2">What we found</p>
          <p className="rounded-md bg-surface px-3.5 py-2.5 text-[13.5px] text-ink">{estimate.job.complaint}</p>
        </div>

        <div className="mt-5">
          <p className="eyebrow mb-2">Recommended work</p>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {estimate.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b border-line px-3.5 py-2.5 text-[13px] last:border-0">
                <div>
                  <p className="text-ink">{item.description}</p>
                  <p className="text-[11px] text-muted">{item.type === "PART" ? "Part" : "Labor"}{item.quantity > 1 ? ` · ×${item.quantity}` : ""}</p>
                </div>
                <p className="font-mono font-medium text-ink">{formatMoney(item.lineTotal, estimate.currency)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-ink px-4 py-3.5 text-paper">
          <div className="flex items-center justify-between text-[15px] font-semibold">
            <span>Total</span>
            <span className="font-mono">{formatMoney(estimate.total, estimate.currency)}</span>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-2.5 rounded-md bg-surface px-3.5 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" />
          <p className="text-[12.5px] text-graphite">
            Your garage will confirm this with you directly before starting any work — nothing happens automatically from this page.
          </p>
        </div>

        {garage.phone && (
          <a
            href={`tel:${garage.phone}`}
            className="mt-3 flex items-center justify-center gap-2 rounded-md border border-line bg-surface py-2.5 text-[13px] font-medium text-ink"
          >
            <Phone className="h-3.5 w-3.5" /> Call {garage.name}
          </a>
        )}

        {estimate.sentAt && <p className="mt-6 text-center text-[11px] text-muted">Sent {formatDate(estimate.sentAt)}</p>}
      </div>
    </div>
  );
}
