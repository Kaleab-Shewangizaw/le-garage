"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Car, CarFront, Search } from "lucide-react";
import { useCreateVehicle, useVehicles } from "@/hooks/use-vehicles";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatMileage } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";
import { useIsFleet } from "@/hooks/use-org";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { VehicleStatusPill } from "@/components/ui/status-pill";
import { VEHICLE_TYPE_LABEL } from "@/lib/job-labels";
import type { Vehicle } from "@/lib/api-types";
import type { VehicleType } from "@le-garage/types";

type FleetTab = "all" | "available" | "off-road" | "retired";

function filterFleet(vehicles: Vehicle[], tab: FleetTab): Vehicle[] {
  switch (tab) {
    case "available":
      return vehicles.filter((v) => v.status === "ACTIVE");
    case "off-road":
      return vehicles.filter((v) => v.status === "IN_MAINTENANCE" || v.status === "UNAVAILABLE");
    case "retired":
      return vehicles.filter((v) => v.status === "RETIRED");
    default:
      return vehicles.filter((v) => v.status !== "RETIRED");
  }
}

export default function VehiclesPage() {
  const isFleet = useIsFleet();
  return isFleet ? <FleetVehicles /> : <GarageVehicles />;
}

/** The fleet register (docs/FLEET.md): every company vehicle and whether it's on the road. */
function FleetVehicles() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FleetTab>("all");
  // One request for the whole pilot-sized fleet (API caps at 200) so the
  // tabs filter instantly without a round trip on a slow connection.
  const vehicles = useVehicles(search || undefined, { limit: 200 });
  const all = vehicles.data ?? [];
  const shown = filterFleet(all, tab).sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
  const offRoadCount = filterFleet(all, "off-road").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Vehicles</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">Your fleet register — and which vehicles are off the road.</p>
        </div>
        <AddVehicleDialog fleet />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as FleetTab)}>
          <TabsList>
            <TabsTrigger value="all">In fleet</TabsTrigger>
            <TabsTrigger value="available">Available</TabsTrigger>
            <TabsTrigger value="off-road">Off the road{offRoadCount > 0 ? ` (${offRoadCount})` : ""}</TabsTrigger>
            <TabsTrigger value="retired">Retired</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input placeholder="Search by plate or VIN…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      {vehicles.isLoading ? (
        <SkeletonRows count={6} />
      ) : vehicles.isError ? (
        <EmptyState icon={Car} title="Couldn't load your vehicles" description={humanizeApiError(vehicles.error)} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Car}
          title={search ? "No vehicles match that search" : all.length === 0 ? "No vehicles yet" : "No vehicles in this view"}
          description={all.length === 0 && !search ? "Add your company's vehicles to start tracking their repairs." : undefined}
        />
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {shown.map((v) => (
            <Link key={v.id} href={`/vehicles/${v.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-black/[0.02] sm:px-5">
              <CarFront className="h-4 w-4 shrink-0 text-graphite" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">
                  <span className="font-mono">{v.licensePlate}</span>{" "}
                  <span className="font-normal text-graphite">
                    {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                  </span>
                </p>
                <p className="truncate text-[12px] text-muted">
                  {v.vehicleType ? VEHICLE_TYPE_LABEL[v.vehicleType] : "Type not set"}
                  {v.driverName && ` · Driver: ${v.driverName}`}
                </p>
              </div>
              <p className="hidden shrink-0 font-mono text-[12.5px] text-graphite sm:block">{formatMileage(v.lastKnownMileage)}</p>
              <VehicleStatusPill status={v.status} className="shrink-0" />
            </Link>
          ))}
        </div>
      )}
      {all.length === 200 && <p className="text-center text-[12px] text-muted">Showing the first 200 vehicles — search to narrow it down.</p>}
    </div>
  );
}

function GarageVehicles() {
  const [search, setSearch] = useState("");
  const vehicles = useVehicles(search || undefined);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Vehicles</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">Every vehicle this garage has serviced.</p>
        </div>
        <AddVehicleDialog />
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <Input placeholder="Search by plate or VIN…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      {vehicles.isLoading ? (
        <SkeletonRows count={6} />
      ) : (vehicles.data ?? []).length === 0 ? (
        <EmptyState
          icon={Car}
          title={search ? "No vehicles match that search" : "No vehicles yet"}
          description={search ? undefined : "Vehicles are added automatically during intake, or you can add one directly."}
        />
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {vehicles.data!.map((v) => (
            <Link key={v.id} href={`/vehicles/${v.id}`} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-black/[0.02]">
              <div className="flex items-center gap-3">
                <CarFront className="h-4 w-4 text-graphite" strokeWidth={1.75} />
                <div>
                  <p className="text-[13.5px] font-medium text-ink">
                    {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                  </p>
                  <p className="font-mono text-[12px] text-graphite">{v.licensePlate}</p>
                </div>
              </div>
              <p className="font-mono text-[12.5px] text-graphite">{formatMileage(v.lastKnownMileage)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AddVehicleDialog({ fleet = false }: { fleet?: boolean }) {
  const [open, setOpen] = useState(false);
  const [licensePlate, setLicensePlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | undefined>();
  const [year, setYear] = useState("");
  const [odometer, setOdometer] = useState("");
  const [vin, setVin] = useState("");
  const create = useCreateVehicle();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        licensePlate: licensePlate.trim(),
        make: make.trim(),
        model: model.trim(),
        ...(fleet
          ? {
              vehicleType,
              year: year ? Number(year) : undefined,
              lastKnownMileage: odometer ? Number(odometer) : undefined,
              vin: vin.trim() || undefined,
            }
          : {}),
      });
      toast.success("Vehicle added");
      setOpen(false);
      setLicensePlate("");
      setMake("");
      setModel("");
      setVehicleType(undefined);
      setYear("");
      setOdometer("");
      setVin("");
    } catch (err) {
      toast.error("Couldn't add vehicle", { description: humanizeApiError(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CarFront className="h-3.5 w-3.5" /> Add vehicle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add vehicle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plate">Plate number</Label>
            <Input id="plate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} autoFocus className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="make">Make</Label>
              <Input id="make" value={make} onChange={(e) => setMake(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
          {fleet && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
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
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, ""))} className="font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="odometer">Odometer (km)</Label>
                  <Input id="odometer" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/[^\d]/g, ""))} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vin">VIN / chassis no.</Label>
                  <Input id="vin" value={vin} onChange={(e) => setVin(e.target.value)} className="font-mono" />
                </div>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!licensePlate || !make || !model}>
              Add vehicle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
