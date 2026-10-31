"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Download, Lock } from "lucide-react";
import { useSpendReport } from "@/hooks/use-reports";
import { useCanApproveSpend } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Section } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { VehicleStatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SpendReport } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";

type Preset = "this-month" | "last-month" | "last-90" | "this-year" | "custom";

/** yyyy-mm-dd in the viewer's local time — what <input type="date"> speaks. */
function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** [from, to) as date-input strings; `to` is exclusive, matching the API. */
function presetRange(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  switch (preset) {
    case "this-month":
      return { from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateInput(tomorrow) };
    case "last-month":
      return {
        from: toDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
      };
    case "last-90":
      return { from: toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)), to: toDateInput(tomorrow) };
    case "this-year":
      return { from: toDateInput(new Date(now.getFullYear(), 0, 1)), to: toDateInput(tomorrow) };
  }
}

/** Local-midnight ISO timestamp for a yyyy-mm-dd input. */
function toIso(dateInput: string): string {
  const [y, m, d] = dateInput.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toISOString();
}

/** Amounts in the CSV are ETB (major units) so it opens cleanly in Excel. */
function toCsv(report: SpendReport): string {
  const etb = (santim: number) => (santim / 100).toFixed(2);
  const header = ["Plate", "Make", "Model", "Status", "Repairs opened", "Invoiced (ETB)", "Paid (ETB)", "Parts (ETB)", "Labor (ETB)", "Downtime (hours)"];
  const rows = report.perVehicle.map((r) => [
    r.vehicle.licensePlate,
    r.vehicle.make,
    r.vehicle.model,
    r.vehicle.status,
    String(r.repairsOpened),
    etb(r.invoicedTotal),
    etb(r.paidTotal),
    etb(r.partsTotal),
    etb(r.laborTotal),
    String(r.downtimeHours),
  ]);
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function downloadCsv(report: SpendReport, from: string, to: string) {
  const blob = new Blob([toCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fleet-spend_${from}_to_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Fleet spend and downtime (docs/FLEET.md). Every figure comes from
 * recorded data — issued invoices, payments, and repair timestamps — for
 * the selected range. Nothing here is projected or estimated.
 */
export default function ReportsPage() {
  const { me } = useAuth();
  const canView = useCanApproveSpend();
  const [preset, setPreset] = useState<Preset>("this-month");
  const [custom, setCustom] = useState(() => presetRange("this-month"));
  const range = preset === "custom" ? custom : presetRange(preset);
  const validRange = !!range.from && !!range.to && range.to > range.from;
  // Don't even ask for figures the API will refuse this role (ReportsController).
  const fetchable = validRange && canView;
  const report = useSpendReport(fetchable ? toIso(range.from) : "", fetchable ? toIso(range.to) : "");

  const zeroSpendVehicles = useMemo(
    () => (report.data?.perVehicle ?? []).filter((r) => r.invoicedTotal === 0 && r.downtimeHours === 0).length,
    [report.data],
  );

  if (me && !canView) {
    return <EmptyState icon={Lock} title="Reports are for owners and supervisors" description="Ask your supervisor if you need these figures." />;
  }

  const data = report.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Reports</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">Maintenance spend and downtime, from your recorded repairs and invoices.</p>
        </div>
        <Button variant="secondary" disabled={!data || data.perVehicle.length === 0} onClick={() => data && downloadCsv(data, range.from, range.to)}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <Tabs value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <TabsList>
            <TabsTrigger value="this-month">This month</TabsTrigger>
            <TabsTrigger value="last-month">Last month</TabsTrigger>
            <TabsTrigger value="last-90">Last 90 days</TabsTrigger>
            <TabsTrigger value="this-year">This year</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
        {preset === "custom" && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Up to (not including)</Label>
              <Input id="to" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </div>
        )}
      </div>

      {!validRange ? (
        <EmptyState icon={BarChart3} title="Pick a valid date range" description="The end date must be after the start date." />
      ) : report.isError ? (
        <EmptyState icon={BarChart3} title="Couldn't load the report" description={humanizeApiError(report.error)} />
      ) : report.isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Invoiced" value={formatMoney(data.totals.invoicedTotal)} hint={`${data.totals.invoiceCount} invoice${data.totals.invoiceCount === 1 ? "" : "s"}`} />
            <Tile label="Paid to providers" value={formatMoney(data.totals.paidTotal)} hint={`${formatMoney(data.totals.outstandingTotal)} unpaid`} />
            <Tile label="Repairs completed" value={String(data.totals.completedRepairs)} hint="Marked repair complete in range" />
            <Tile
              label="Average turnaround"
              value={data.totals.averageTurnaroundHours == null ? "—" : formatHours(data.totals.averageTurnaroundHours)}
              hint={data.totals.averageTurnaroundHours == null ? "No completed repairs yet" : "Reported → repair complete"}
            />
          </div>

          {data.truncated && (
            <p className="rounded-md bg-signal-soft px-3 py-2 text-[12.5px] text-signal-hover">
              This range has more records than one report can total. Choose a shorter range for exact figures.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Spend by category">
              <BreakdownTable
                rows={[
                  ["Parts", data.totals.byCategory.parts],
                  ["Labor", data.totals.byCategory.labor],
                  ...(data.totals.byCategory.uncategorized > 0 ? ([["Not categorized", data.totals.byCategory.uncategorized]] as [string, number][]) : []),
                  ...(data.totals.byCategory.tax > 0 ? ([["Tax", data.totals.byCategory.tax]] as [string, number][]) : []),
                  ...(data.totals.byCategory.discount > 0 ? ([["Discounts", -data.totals.byCategory.discount]] as [string, number][]) : []),
                ]}
                total={data.totals.invoicedTotal}
              />
            </Section>
            <Section title="Spend by provider">
              {data.byProvider.length === 0 ? (
                <p className="text-[13px] text-graphite">No invoices issued in this range.</p>
              ) : (
                <BreakdownTable
                  rows={data.byProvider.map((p) => [`${p.name} · ${p.invoices} invoice${p.invoices === 1 ? "" : "s"}`, p.invoicedTotal] as [string, number])}
                  total={data.totals.invoicedTotal}
                />
              )}
            </Section>
          </div>

          <Section
            title="By vehicle"
            action={zeroSpendVehicles > 0 ? <span className="text-[11.5px] text-muted">{zeroSpendVehicles} with no spend or downtime</span> : undefined}
          >
            {data.perVehicle.length === 0 ? (
              <EmptyState icon={BarChart3} title="No vehicles yet" description="Add vehicles to see their maintenance spend." />
            ) : (
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-paper text-left text-[11.5px] font-medium uppercase tracking-wide text-graphite">
                      <th className="px-3 py-2">Vehicle</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Repairs</th>
                      <th className="px-3 py-2 text-right">Invoiced</th>
                      <th className="px-3 py-2 text-right">Parts / labor</th>
                      <th className="px-3 py-2 text-right">Downtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perVehicle.map((r) => (
                      <tr key={r.vehicleId} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">
                          <Link href={`/vehicles/${r.vehicleId}`} className="hover:underline">
                            <span className="font-mono font-medium text-ink">{r.vehicle.licensePlate}</span>{" "}
                            <span className="text-graphite">
                              {r.vehicle.make} {r.vehicle.model}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <VehicleStatusPill status={r.vehicle.status} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-graphite">{r.repairsOpened}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-ink">{formatMoney(r.invoicedTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] text-graphite">
                          {formatMoney(r.partsTotal).replace("ETB ", "")} / {formatMoney(r.laborTotal).replace("ETB ", "")}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-graphite">{r.downtimeHours > 0 ? formatHours(r.downtimeHours) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <p className="text-[11.5px] text-muted">
            Spend counts issued invoices by issue date; voided invoices are excluded. Downtime is the time a vehicle spent with an open repair (reported → back in service)
            within the range, including repairs still open today.
          </p>
        </>
      )}
    </div>
  );
}

function formatHours(hours: number): string {
  if (hours < 48) return `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
  return `${(hours / 24).toLocaleString("en-US", { maximumFractionDigits: 1 })} days`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-[12px] text-graphite">{label}</p>
      <p className="mt-1.5 truncate font-mono text-[18px] font-semibold leading-none text-ink">{value}</p>
      {hint && <p className="mt-1.5 truncate text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}

function BreakdownTable({ rows, total }: { rows: [string, number][]; total: number }) {
  return (
    <div className="space-y-1.5">
      {rows.map(([label, amount]) => (
        <div key={label} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="min-w-0 truncate text-ink">{label}</span>
          <span className="shrink-0 font-mono text-graphite">{formatMoney(amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-line pt-1.5 text-[13.5px] font-semibold text-ink">
        <span>Total</span>
        <span className="font-mono">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
