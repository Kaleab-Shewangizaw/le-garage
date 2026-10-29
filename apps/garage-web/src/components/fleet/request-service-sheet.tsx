"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { VehicleStatusPill } from "@/components/ui/status-pill";
import { useVehicles } from "@/hooks/use-vehicles";
import { useServiceProviders } from "@/hooks/use-service-providers";
import { useCreateJob } from "@/hooks/use-jobs";
import { api } from "@/lib/api-client";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import type { Vehicle } from "@/lib/api-types";
import { formatMileage } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";

const NO_PROVIDER = "none";

/**
 * Fleet intake (docs/FLEET.md): a service request — anything from a
 * scheduled service to a breakdown. One panel: pick a registered vehicle,
 * say what it needs, optionally say which garage will look at it. No customer: the company owns the vehicle.
 * Vehicles must already be in the register, so the fleet's records stay
 * the single source of truth rather than accumulating ad-hoc duplicates.
 */
export function RequestServiceSheet({ trigger, vehicle: presetVehicle }: { trigger: React.ReactNode; vehicle?: Vehicle }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const [vehicleQuery, setVehicleQuery] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(presetVehicle ?? null);
  const [odometer, setOdometer] = useState("");
  const [request, setRequest] = useState("");
  const [providerId, setProviderId] = useState<string>(NO_PROVIDER);
  const [sendNow, setSendNow] = useState(true);
  const [garageNote, setGarageNote] = useState("");

  const vehicles = useVehicles(vehicleQuery);
  const providers = useServiceProviders();
  const idempotency = useIdempotencyKey();
  const createJob = useCreateJob(idempotency.key);

  function reset() {
    setVehicleQuery("");
    setSelectedVehicle(presetVehicle ?? null);
    setOdometer("");
    setRequest("");
    setProviderId(NO_PROVIDER);
    setSendNow(true);
    setGarageNote("");
    idempotency.rotate();
  }

  const chosenProvider = providers.data?.find((p) => p.id === providerId);
  const connected = !!chosenProvider?.garageOrganizationId;
  const odometerValue = odometer ? Number(odometer) : undefined;
  const odometerBelowLast =
    odometerValue != null && selectedVehicle?.lastKnownMileage != null && odometerValue < selectedVehicle.lastKnownMileage;
  const canSubmit = !!selectedVehicle && request.trim().length > 0 && !createJob.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedVehicle) return;
    try {
      const job = await createJob.mutateAsync({
        vehicleId: selectedVehicle.id,
        complaint: request.trim(),
        mileageAtIntake: odometerValue,
        serviceProviderId: providerId === NO_PROVIDER ? undefined : providerId,
      });
      if (connected && sendNow) {
        // Work orders (docs/WORK-ORDERS.md): the garage is notified and does the work in its own account.
        try {
          await api.post(`/jobs/${job.id}/work-order`, { message: garageNote.trim() || undefined });
          toast.success(`Sent to ${chosenProvider!.name}`, { description: "They've been notified by SMS, email and in the app." });
        } catch (err) {
          toast.error(`Request saved, but couldn't send it to ${chosenProvider!.name}`, { description: humanizeApiError(err) });
        }
      } else {
        toast.success("Service requested", { description: `${selectedVehicle.licensePlate} is now marked in maintenance.` });
      }
      setOpen(false);
      reset();
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      toast.error("Couldn't create the service request", { description: humanizeApiError(err) });
      idempotency.rotate();
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
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>New service request</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              {selectedVehicle ? (
                <div className="flex items-center justify-between rounded-md border border-line bg-paper px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-good" />
                    <div>
                      <p className="text-[13px] font-medium text-ink">
                        {selectedVehicle.make} {selectedVehicle.model}{" "}
                        <span className="font-mono text-[12px] text-graphite">{selectedVehicle.licensePlate}</span>
                      </p>
                      <p className="text-[11.5px] text-graphite">Last odometer: {formatMileage(selectedVehicle.lastKnownMileage)}</p>
                    </div>
                  </div>
                  {!presetVehicle && (
                    <button type="button" onClick={() => setSelectedVehicle(null)} className="text-[12px] font-medium text-graphite hover:text-ink">
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <SearchSelect
                    placeholder="Search plate number…"
                    query={vehicleQuery}
                    onQueryChange={setVehicleQuery}
                    results={vehicles.data?.filter((v) => v.status !== "RETIRED")}
                    isLoading={vehicles.isLoading}
                    keyOf={(v) => v.id}
                    onSelect={(v) => setSelectedVehicle(v)}
                    emptyHint="No vehicle with that plate in your register"
                    recentLabel="Recently updated"
                    renderResult={(v) => (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span>
                          <span className="font-mono">{v.licensePlate}</span>{" "}
                          <span className="text-graphite">
                            {v.make} {v.model}
                          </span>
                        </span>
                        <VehicleStatusPill status={v.status} />
                      </div>
                    )}
                  />
                  <FieldHint>
                    Not in the list?{" "}
                    <Link href="/vehicles" className="font-medium text-ink underline underline-offset-2">
                      Add it to your vehicles
                    </Link>{" "}
                    first.
                  </FieldHint>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="request">What does the vehicle need?</Label>
              <Textarea
                id="request"
                placeholder="e.g. 10,000 km service due · brakes squeal when stopping · new tyres before the Adama run"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="odometer">Odometer (km)</Label>
              <Input
                id="odometer"
                inputMode="numeric"
                placeholder={selectedVehicle?.lastKnownMileage ? `Last: ${selectedVehicle.lastKnownMileage.toLocaleString("en-US")}` : "Optional"}
                value={odometer}
                onChange={(e) => setOdometer(e.target.value.replace(/[^\d]/g, ""))}
                className="font-mono"
              />
              {odometerBelowLast && <FieldHint>That&apos;s lower than the last recorded reading — double-check it.</FieldHint>}
            </div>

            <div className="space-y-1.5">
              <Label>Service provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROVIDER}>Decide later</SelectItem>
                  {providers.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.garageOrganizationId ? " · on Le Garage" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {connected && (
              <div className="space-y-2 rounded-md border border-line bg-paper p-3">
                <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
                  <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} className="mt-0.5 accent-ink" />
                  <span>
                    Send to {chosenProvider!.name} now
                    <span className="block text-[12px] text-graphite">They get an SMS, email and in-app notice, accept it, and post their estimate and progress for you to approve.</span>
                  </span>
                </label>
                {sendNow && (
                  <Textarea rows={2} value={garageNote} onChange={(e) => setGarageNote(e.target.value)} placeholder="Note for the garage (optional) — e.g. needed back by Friday" />
                )}
              </div>
            )}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createJob.isPending} disabled={!canSubmit}>
              Request service
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
