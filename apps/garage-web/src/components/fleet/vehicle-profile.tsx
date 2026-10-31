"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CarFront, Clock, FileClock, Fuel, Gauge, Pencil, Phone, User, Wallet, Wrench } from "lucide-react";
import type { AttachmentTag, FuelType, VehicleStatus, VehicleType } from "@le-garage/types";
import { useUpdateVehicle, useVehicle, useVehicleVisits } from "@/hooks/use-vehicles";
import { useAttachments, useAttachmentUrl } from "@/hooks/use-files";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { JobStatusPill, VehicleStatusPill } from "@/components/ui/status-pill";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhotoAttachments, PhotoStrip } from "@/components/jobs/photo-attachments";
import { RequestServiceSheet } from "@/components/fleet/request-service-sheet";
import {
  ATTACHMENT_TAG_LABEL,
  FUEL_TYPE_LABEL,
  VEHICLE_PHOTO_TAGS,
  VEHICLE_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
} from "@/lib/job-labels";
import type { Attachment, Vehicle, VehicleVisit } from "@/lib/api-types";
import { formatDate, formatMileage, formatMoney } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const HOUR = 3600_000;

/** How long a visit kept the vehicle off the road; open visits count up to now. */
function visitDowntimeMs(v: VehicleVisit): number {
  const end = v.collectedAt ?? v.cancelledAt ?? new Date().toISOString();
  return Math.max(0, new Date(end).getTime() - new Date(v.intakeAt).getTime());
}

function formatDuration(ms: number): string {
  const hours = ms / HOUR;
  if (hours < 48) return `${Math.max(1, Math.round(hours))} h`;
  return `${(hours / 24).toLocaleString("en-US", { maximumFractionDigits: 1 })} days`;
}

/**
 * A fleet vehicle's profile (docs/FLEET.md §"Vehicle profile"): who drives
 * it, its details, and — the point of it — every time it went in for
 * service, with what was found, who did the work, what it cost, how long
 * it was off the road, and the photos that prove it. Built from the
 * vehicle's recorded repairs and attachments; nothing here is estimated.
 */
export function VehicleProfile({ id }: { id: string }) {
  const vehicle = useVehicle(id);
  const visits = useVehicleVisits(id);
  const vehiclePhotos = useAttachments("VEHICLE", id);

  const stats = useMemo(() => {
    const list = visits.data ?? [];
    const completed = list.filter((v) => v.collectedAt);
    return {
      visits: list.length,
      invoiced: list.reduce((sum, v) => sum + (v.invoiceTotal ?? 0), 0),
      unpaid: list.reduce((sum, v) => sum + (v.invoiceTotal != null ? v.invoiceTotal - (v.amountPaid ?? 0) : 0), 0),
      downtimeMs: list.filter((v) => v.status !== "CANCELLED").reduce((sum, v) => sum + visitDowntimeMs(v), 0),
      lastService: completed[0]?.collectedAt ?? null,
    };
  }, [visits.data]);

  if (vehicle.isError) {
    return <EmptyState icon={AlertTriangle} title="Couldn't load this vehicle" description="It may have been removed, or you may not have access to it." />;
  }
  if (vehicle.isLoading || !vehicle.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const v = vehicle.data;
  const cover =
    vehiclePhotos.data?.find((a) => a.tag === "VEHICLE_PROFILE" && a.mimeType.startsWith("image/")) ??
    vehiclePhotos.data?.find((a) => a.mimeType.startsWith("image/"));
  const repairPhotos = (visits.data ?? []).flatMap((visit) => visit.attachments);

  return (
    <div className="space-y-6">
      <Link href="/vehicles" className="inline-flex items-center gap-1 text-[12.5px] text-graphite hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Vehicles
      </Link>

      {/* ── Profile header ── */}
      <div className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:p-5">
        <CoverPhoto attachment={cover} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded-sm bg-ink px-2 py-0.5 font-mono text-[14px] font-semibold text-paper">{v.licensePlate}</span>
                <h1 className="text-[20px] font-semibold tracking-tight text-ink">
                  {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                </h1>
              </div>
              <p className="mt-1 text-[13px] text-graphite">
                {[v.vehicleType && VEHICLE_TYPE_LABEL[v.vehicleType], v.color, v.acquiredAt && `In the fleet since ${formatDate(v.acquiredAt)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VehicleStatusControl vehicle={v} />
              <EditProfileDialog vehicle={v} />
              {v.status !== "RETIRED" && <RequestServiceSheet vehicle={v} trigger={<Button>Request service</Button>} />}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
            <Fact icon={Gauge} label="Odometer" value={formatMileage(v.lastKnownMileage)} mono />
            <Fact icon={Fuel} label="Fuel" value={v.fuelType ? FUEL_TYPE_LABEL[v.fuelType] : "—"} />
            <Fact icon={User} label="Driver" value={v.driverName ?? "Not assigned"} />
            <Fact icon={Phone} label="Driver phone" value={v.driverPhone ?? "—"} mono />
            <Fact icon={CarFront} label="VIN / chassis" value={v.vin ?? "—"} mono />
          </dl>
          {v.notes && <p className="rounded-md bg-paper px-3 py-2 text-[12.5px] text-graphite">{v.notes}</p>}
        </div>
      </div>

      {/* ── At a glance ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Wrench} label="Service visits" value={visits.isLoading ? undefined : String(stats.visits)} />
        <Stat icon={Wallet} label="Invoiced in total" value={visits.isLoading ? undefined : formatMoney(stats.invoiced)} hint={stats.unpaid > 0 ? `${formatMoney(stats.unpaid)} unpaid` : undefined} />
        <Stat icon={Clock} label="Time off the road" value={visits.isLoading ? undefined : stats.downtimeMs > 0 ? formatDuration(stats.downtimeMs) : "—"} />
        <Stat icon={FileClock} label="Last service" value={visits.isLoading ? undefined : stats.lastService ? formatDate(stats.lastService) : "—"} />
      </div>

      <Tabs defaultValue="visits">
        <TabsList>
          <TabsTrigger value="visits">Service visits</TabsTrigger>
          <TabsTrigger value="photos">Photos &amp; documents</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="pt-5">
          {visits.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : visits.isError ? (
            <EmptyState icon={AlertTriangle} title="Couldn't load the visit history" description={humanizeApiError(visits.error)} />
          ) : (visits.data ?? []).length === 0 ? (
            <EmptyState icon={Wrench} title="No service visits yet" description="Each service request for this vehicle will appear here, with its photos and costs." />
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {visits.data!.map((visit) => (
                <VisitCard key={visit.id} visit={visit} />
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="photos" className="space-y-8 pt-5">
          <Section title="Vehicle photos & documents" action={<span className="text-[11.5px] text-muted">Condition, damage, registration, insurance…</span>}>
            <PhotoAttachments entityType="VEHICLE" entityId={v.id} tagOptions={VEHICLE_PHOTO_TAGS} />
          </Section>
          <Section title="From service visits" action={<span className="text-[11.5px] text-muted">{repairPhotos.length} photo{repairPhotos.length === 1 ? "" : "s"}</span>}>
            <TaggedGallery attachments={repairPhotos} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CoverPhoto({ attachment }: { attachment?: Attachment }) {
  const signed = useAttachmentUrl(attachment?.id);
  return (
    <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-paper sm:w-60">
      {attachment && signed.data?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signed.data.url} alt="Vehicle" className="h-full w-full object-cover" />
      ) : (
        <div className="text-center text-muted">
          <CarFront className="mx-auto h-8 w-8" strokeWidth={1.25} />
          <p className="mt-1 text-[11.5px]">Add a vehicle photo under Photos</p>
        </div>
      )}
    </div>
  );
}

function Fact({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11.5px] text-muted">
        <Icon className="h-3 w-3" strokeWidth={1.75} /> {label}
      </dt>
      <dd className={cn("mt-0.5 truncate text-[13px] text-ink", mono && "font-mono text-[12.5px]")}>{value}</dd>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <Icon className="h-4 w-4 text-graphite" strokeWidth={1.75} />
      {value === undefined ? <Skeleton className="mt-3 h-5 w-16" /> : <p className="mt-2.5 truncate font-mono text-[17px] font-semibold leading-none text-ink">{value}</p>}
      <p className="mt-1.5 text-[12px] text-graphite">{label}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-signal-hover">{hint}</p>}
    </div>
  );
}

function VisitCard({ visit }: { visit: VehicleVisit }) {
  const open = !visit.collectedAt && !visit.cancelledAt;
  const cost = visit.invoiceTotal ?? visit.estimateTotal;
  const diagnosis = visit.diagnoses[0];
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[26.5px] top-4 h-3 w-3 rounded-full border-2 border-surface",
          open ? "bg-signal" : visit.status === "CANCELLED" ? "bg-muted" : "bg-ink",
        )}
        aria-hidden
      />
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="font-mono text-[11.5px] text-muted">
              {formatDate(visit.intakeAt)}
              {visit.collectedAt && ` → ${formatDate(visit.collectedAt)}`}
              {visit.mileageAtIntake != null && ` · ${formatMileage(visit.mileageAtIntake)}`}
              {visit.status !== "CANCELLED" && ` · ${open ? "off the road for " : ""}${formatDuration(visitDowntimeMs(visit))}`}
            </p>
            <p className="mt-0.5 text-[14px] font-medium text-ink">{visit.complaint}</p>
            <p className="mt-0.5 text-[12.5px] text-graphite">{visit.serviceProvider?.name ?? "No service provider recorded"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
            <JobStatusPill status={visit.status} />
            {cost != null && (
              <p className="font-mono text-[13px] font-semibold text-ink">
                {formatMoney(cost)}
                <span className="ml-1 text-[11px] font-normal text-muted">{visit.invoiceTotal != null ? "invoiced" : "estimate"}</span>
              </p>
            )}
            {visit.invoiceTotal != null && visit.amountPaid != null && visit.amountPaid < visit.invoiceTotal && (
              <p className="text-[11.5px] text-signal-hover">{formatMoney(visit.invoiceTotal - visit.amountPaid)} unpaid</p>
            )}
          </div>
        </div>
        {diagnosis && (
          <p className="mt-2.5 text-[12.5px] text-graphite">
            <span className="font-medium text-ink">Found:</span> {diagnosis.observedProblem}
            {diagnosis.severity && <span className="ml-1 text-[11px] uppercase text-muted">({diagnosis.severity.toLowerCase()})</span>}
          </p>
        )}
        {visit.attachments.length > 0 && (
          <div className="mt-3">
            <PhotoStrip attachments={visit.attachments} />
          </div>
        )}
        <div className="mt-3 text-right">
          <Link href={`/jobs/${visit.id}`} className="text-[12.5px] font-medium text-graphite hover:text-ink">
            Open repair →
          </Link>
        </div>
      </div>
    </li>
  );
}

/** All of a vehicle's repair photos, filterable by what they show. */
function TaggedGallery({ attachments }: { attachments: Attachment[] }) {
  const [filter, setFilter] = useState<AttachmentTag | "ALL">("ALL");
  const tags = [...new Set(attachments.map((a) => a.tag).filter((t): t is AttachmentTag => !!t))];
  const shown = filter === "ALL" ? attachments : attachments.filter((a) => a.tag === filter);
  if (attachments.length === 0) {
    return <p className="text-[13px] text-graphite">Photos added to this vehicle&apos;s repairs (before/after, replaced parts, receipts) collect here.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(["ALL", ...tags] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              filter === t ? "bg-ink text-paper" : "bg-black/[0.05] text-graphite hover:bg-black/[0.08]",
            )}
          >
            {t === "ALL" ? `All (${attachments.length})` : ATTACHMENT_TAG_LABEL[t]}
          </button>
        ))}
      </div>
      <PhotoStrip key={filter} attachments={shown} size="lg" />
    </div>
  );
}

/**
 * Manual availability (docs/FLEET.md §4). IN_MAINTENANCE is managed by repairs
 * themselves, so it isn't offered as a manual choice. Mechanics can't change it
 * (the API refuses too), so they just see the status.
 */
function VehicleStatusControl({ vehicle }: { vehicle: Vehicle }) {
  const { me } = useAuth();
  const update = useUpdateVehicle(vehicle.id);
  const canChange = me?.staffMember && me.staffMember.role !== "TECHNICIAN";
  if (!canChange) return <VehicleStatusPill status={vehicle.status} />;

  const options: VehicleStatus[] = ["ACTIVE", "UNAVAILABLE", "RETIRED"];
  async function handleChange(status: string) {
    if (status === vehicle.status) return;
    try {
      await update.mutateAsync({ status: status as VehicleStatus });
      toast.success(`Marked ${VEHICLE_STATUS_LABEL[status as VehicleStatus].toLowerCase()}`);
    } catch (err) {
      toast.error("Couldn't change the vehicle status", { description: humanizeApiError(err) });
    }
  }
  return (
    <Select value={vehicle.status} onValueChange={handleChange} disabled={update.isPending}>
      <SelectTrigger className="w-[170px]" aria-label="Vehicle status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {vehicle.status === "IN_MAINTENANCE" && <SelectItem value="IN_MAINTENANCE">In maintenance</SelectItem>}
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {VEHICLE_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Edit the vehicle's profile details. Only fields that changed are sent. */
function EditProfileDialog({ vehicle }: { vehicle: Vehicle }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const update = useUpdateVehicle(vehicle.id);
  const initial = {
    licensePlate: vehicle.licensePlate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year ? String(vehicle.year) : "",
    color: vehicle.color ?? "",
    vin: vehicle.vin ?? "",
    vehicleType: vehicle.vehicleType ?? undefined,
    fuelType: vehicle.fuelType ?? undefined,
    acquiredAt: vehicle.acquiredAt ? vehicle.acquiredAt.slice(0, 10) : "",
    driverName: vehicle.driverName ?? "",
    driverPhone: vehicle.driverPhone ?? "",
    notes: vehicle.notes ?? "",
  };
  const [form, setForm] = useState(initial);
  if (!me?.staffMember || me.staffMember.role === "TECHNICIAN") return null;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        licensePlate: form.licensePlate.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        year: form.year ? Number(form.year) : undefined,
        color: form.color.trim() || null,
        vin: form.vin.trim() || null,
        vehicleType: form.vehicleType as VehicleType | undefined,
        fuelType: form.fuelType as FuelType | undefined,
        acquiredAt: form.acquiredAt ? new Date(form.acquiredAt) : null,
        driverName: form.driverName.trim() || null,
        driverPhone: form.driverPhone.trim() || null,
        notes: form.notes.trim() || null,
      });
      toast.success("Vehicle profile saved");
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't save the profile", { description: humanizeApiError(err) });
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setForm(initial);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit profile
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vehicle profile</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Plate" id="p-plate">
                <Input id="p-plate" value={form.licensePlate} onChange={set("licensePlate")} className="font-mono" />
              </Field>
              <Field label="Make" id="p-make">
                <Input id="p-make" value={form.make} onChange={set("make")} />
              </Field>
              <Field label="Model" id="p-model">
                <Input id="p-model" value={form.model} onChange={set("model")} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Year" id="p-year">
                <Input id="p-year" inputMode="numeric" maxLength={4} value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value.replace(/[^\d]/g, "") }))} className="font-mono" />
              </Field>
              <Field label="Type">
                <Select value={form.vehicleType} onValueChange={(val) => setForm((f) => ({ ...f, vehicleType: val as VehicleType }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VEHICLE_TYPE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fuel">
                <Select value={form.fuelType} onValueChange={(val) => setForm((f) => ({ ...f, fuelType: val as FuelType }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FUEL_TYPE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Color" id="p-color">
                <Input id="p-color" value={form.color} onChange={set("color")} />
              </Field>
              <Field label="VIN / chassis" id="p-vin" className="col-span-2">
                <Input id="p-vin" value={form.vin} onChange={set("vin")} className="font-mono" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="In fleet since" id="p-acquired">
                <Input id="p-acquired" type="date" value={form.acquiredAt} onChange={set("acquiredAt")} />
              </Field>
              <Field label="Driver" id="p-driver">
                <Input id="p-driver" value={form.driverName} onChange={set("driverName")} />
              </Field>
              <Field label="Driver phone" id="p-driver-phone">
                <Input id="p-driver-phone" value={form.driverPhone} onChange={set("driverPhone")} className="font-mono" />
              </Field>
            </div>
            <Field label="Notes" id="p-notes">
              <Textarea id="p-notes" rows={3} value={form.notes} onChange={set("notes")} placeholder="Route, insurance company, anything the team should know" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={update.isPending} disabled={!form.licensePlate.trim() || !form.make.trim() || !form.model.trim()}>
                Save profile
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, id, className, children }: { label: string; id?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
