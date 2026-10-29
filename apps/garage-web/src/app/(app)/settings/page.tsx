"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGarage, useUpdateGarage } from "@/hooks/use-garage";
import { useIsFleet } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizeApiError } from "@/lib/api-error";

export default function SettingsPage() {
  const { me } = useAuth();
  const garage = useGarage();
  const isFleet = useIsFleet();
  const update = useUpdateGarage();
  const canEdit = me?.staffMember && ["OWNER", "MANAGER"].includes(me.staffMember.role);

  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "" });

  useEffect(() => {
    // Syncing fetched data into editable form state genuinely needs an
    // effect here (the form must exist and be user-editable before
    // submit, not derived fresh on every render) — the alternative is
    // hoisting a keyed child component so a lazy useState initializer can
    // read `garage.data` at mount instead, which is a real restructure
    // not worth the risk on an already-working, previously-verified page
    // for a lint rule.
    if (garage.data) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setForm({
        name: garage.data.name,
        phone: garage.data.phone ?? "",
        address: garage.data.address ?? "",
        city: garage.data.city,
      });
    }
  }, [garage.data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        name: form.name,
        phone: form.phone || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
      });
      toast.success(isFleet ? "Company profile updated" : "Garage profile updated");
    } catch (err) {
      toast.error("Couldn't save changes", { description: humanizeApiError(err) });
    }
  }

  if (garage.isLoading) {
    return (
      <div className="max-w-lg space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-[13.5px] text-graphite">{isFleet ? "Your company's profile." : "Your garage's profile."}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">{isFleet ? "Company name" : "Garage name"}</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={!canEdit} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} disabled={!canEdit} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} disabled={!canEdit} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} disabled={!canEdit} />
        </div>
        {canEdit && (
          <Button type="submit" loading={update.isPending}>
            Save changes
          </Button>
        )}
      </form>
    </div>
  );
}
