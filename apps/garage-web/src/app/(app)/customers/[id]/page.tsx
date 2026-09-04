"use client";

import { use } from "react";
import { useCustomer } from "@/hooks/use-customers";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const customer = useCustomer(id);

  if (customer.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!customer.data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">{customer.data.fullName}</h1>
        <p className="mt-0.5 font-mono text-[13.5px] text-graphite">{customer.data.phone}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="eyebrow">Contact</p>
          <p className="mt-2 text-[13.5px] text-ink">{customer.data.email ?? "No email on file"}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="eyebrow">Customer since</p>
          <p className="mt-2 font-mono text-[13.5px] text-ink">{formatDate(customer.data.createdAt)}</p>
        </div>
      </div>

      {customer.data.notes && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="eyebrow">Notes</p>
          <p className="mt-2 text-[13.5px] text-ink">{customer.data.notes}</p>
        </div>
      )}
    </div>
  );
}
