"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, UserPlus, CarFront } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { useCustomers } from "@/hooks/use-customers";
import { useVehicles } from "@/hooks/use-vehicles";
import { useCreateJob } from "@/hooks/use-jobs";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import type { Customer, Vehicle } from "@/lib/api-types";
import { humanizeApiError } from "@/lib/api-error";

/**
 * The intake flow (docs/UX.md §"Intake UX", brief §14): plate/customer
 * search -> select or create -> mileage -> complaint -> done, in one
 * panel. No multi-step wizard with "next" buttons — everything a mechanic
 * needs is visible and fillable in one pass, because intake has to be
 * faster than the notebook it replaces.
 */
export function NewJobSheet({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const [vehicleQuery, setVehicleQuery] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newMake, setNewMake] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newYear, setNewYear] = useState("");

  const [mileage, setMileage] = useState("");
  const [complaint, setComplaint] = useState("");

  const customers = useCustomers(customerQuery);
  const vehicles = useVehicles(vehicleQuery);
  const idempotency = useIdempotencyKey();
  const createJob = useCreateJob(idempotency.key);

  function reset() {
    setCustomerQuery("");
    setSelectedCustomer(null);
    setCreatingCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setVehicleQuery("");
    setSelectedVehicle(null);
    setCreatingVehicle(false);
    setNewPlate("");
    setNewMake("");
    setNewModel("");
    setNewYear("");
    setMileage("");
    setComplaint("");
    idempotency.rotate();
  }

  const hasCustomer = !!selectedCustomer || (creatingCustomer && newCustomerName && newCustomerPhone);
  const hasVehicle = !!selectedVehicle || (creatingVehicle && newPlate && newMake && newModel);
  const canSubmit = hasCustomer && hasVehicle && complaint.trim().length > 0 && !createJob.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      const job = await createJob.mutateAsync({
        customerId: selectedCustomer?.id,
        newCustomer: !selectedCustomer ? { fullName: newCustomerName, phone: newCustomerPhone } : undefined,
        vehicleId: selectedVehicle?.id,
        newVehicle: !selectedVehicle
          ? { licensePlate: newPlate, make: newMake, model: newModel, year: newYear ? Number(newYear) : undefined }
          : undefined,
        complaint,
        mileageAtIntake: mileage ? Number(mileage) : undefined,
      });
      toast.success("Job created", { description: `${newMake || selectedVehicle?.make} ${newModel || selectedVehicle?.model} is now in intake.` });
      setOpen(false);
      reset();
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      toast.error("Couldn't create the job", { description: humanizeApiError(err) });
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New job</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <SheetBody className="space-y-6">
            {/* Customer */}
            <div className="space-y-2">
              <Label>Customer</Label>
              {selectedCustomer ? (
                <SelectedChip
                  primary={selectedCustomer.fullName}
                  secondary={selectedCustomer.phone}
                  onClear={() => setSelectedCustomer(null)}
                />
              ) : creatingCustomer ? (
                <div className="space-y-2 rounded-md border border-line p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-medium text-graphite">New customer</p>
                    <button type="button" className="text-[12px] text-graphite hover:text-ink" onClick={() => setCreatingCustomer(false)}>
                      Search instead
                    </button>
                  </div>
                  <Input placeholder="Full name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} autoFocus />
                  <Input placeholder="Phone number" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                </div>
              ) : (
                <>
                  <SearchSelect
                    placeholder="Search by name or phone…"
                    query={customerQuery}
                    onQueryChange={setCustomerQuery}
                    results={customers.data}
                    isLoading={customers.isFetching}
                    keyOf={(c) => c.id}
                    onSelect={(c) => {
                      setSelectedCustomer(c);
                      setCustomerQuery("");
                    }}
                    renderResult={(c) => (
                      <>
                        <span className="font-medium text-ink">{c.fullName}</span>
                        <span className="font-mono text-[12px] text-graphite">{c.phone}</span>
                      </>
                    )}
                    emptyHint="No customer found — you can add one"
                  />
                  <button
                    type="button"
                    onClick={() => setCreatingCustomer(true)}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-graphite hover:text-ink"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Add a new customer
                  </button>
                </>
              )}
            </div>

            {/* Vehicle */}
            <div className="space-y-2">
              <Label>Vehicle</Label>
              {selectedVehicle ? (
                <SelectedChip
                  primary={`${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.year ? ` (${selectedVehicle.year})` : ""}`}
                  secondary={selectedVehicle.licensePlate}
                  mono
                  onClear={() => setSelectedVehicle(null)}
                />
              ) : creatingVehicle ? (
                <div className="space-y-2 rounded-md border border-line p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-medium text-graphite">New vehicle</p>
                    <button type="button" className="text-[12px] text-graphite hover:text-ink" onClick={() => setCreatingVehicle(false)}>
                      Search instead
                    </button>
                  </div>
                  <Input placeholder="Plate number (e.g. AA-12345)" value={newPlate} onChange={(e) => setNewPlate(e.target.value)} autoFocus className="font-mono" />
                  <div className="flex gap-2">
                    <Input placeholder="Make (e.g. Toyota)" value={newMake} onChange={(e) => setNewMake(e.target.value)} />
                    <Input placeholder="Model (e.g. Corolla)" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
                  </div>
                  <Input placeholder="Year (optional)" value={newYear} onChange={(e) => setNewYear(e.target.value.replace(/\D/g, ""))} className="font-mono" />
                </div>
              ) : (
                <>
                  <SearchSelect
                    placeholder="Search by plate number…"
                    query={vehicleQuery}
                    onQueryChange={setVehicleQuery}
                    results={vehicles.data}
                    isLoading={vehicles.isFetching}
                    keyOf={(v) => v.id}
                    onSelect={(v) => {
                      setSelectedVehicle(v);
                      setVehicleQuery("");
                    }}
                    renderResult={(v) => (
                      <>
                        <span className="font-mono font-medium text-ink">{v.licensePlate}</span>
                        <span className="text-[12px] text-graphite">
                          {v.make} {v.model} {v.year ? `· ${v.year}` : ""}
                        </span>
                      </>
                    )}
                    emptyHint="No vehicle found — you can add one"
                  />
                  <button
                    type="button"
                    onClick={() => setCreatingVehicle(true)}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-graphite hover:text-ink"
                  >
                    <CarFront className="h-3.5 w-3.5" /> Add a new vehicle
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mileage">Mileage</Label>
              <Input id="mileage" placeholder="e.g. 84000" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))} className="font-mono" />
              <FieldHint>Optional, but helps track service intervals.</FieldHint>
            </div>

            <div className="space-y-2">
              <Label htmlFor="complaint">What&apos;s wrong with the car?</Label>
              <Textarea
                id="complaint"
                placeholder="In the customer's words — e.g. “makes a knocking sound when I turn left”"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                rows={3}
              />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} loading={createJob.isPending}>
              <Check className="h-3.5 w-3.5" />
              Create job
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SelectedChip({ primary, secondary, mono, onClear }: { primary: string; secondary: string; mono?: boolean; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-paper px-3 py-2">
      <div>
        <p className="text-[13.5px] font-medium text-ink">{primary}</p>
        <p className={mono ? "font-mono text-[12px] text-graphite" : "text-[12px] text-graphite"}>{secondary}</p>
      </div>
      <button type="button" onClick={onClear} className="text-[12px] font-medium text-graphite hover:text-ink">
        Change
      </button>
    </div>
  );
}
