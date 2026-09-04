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

export default function VehiclesPage() {
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

function AddVehicleDialog() {
  const [open, setOpen] = useState(false);
  const [licensePlate, setLicensePlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const create = useCreateVehicle();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ licensePlate, make, model });
      toast.success("Vehicle added");
      setOpen(false);
      setLicensePlate("");
      setMake("");
      setModel("");
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
