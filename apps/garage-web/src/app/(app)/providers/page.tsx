"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, Link2, Phone, Plus, Search } from "lucide-react";
import { useCreateServiceProvider, useGarageDirectory, useServiceProviders, useUpdateServiceProvider } from "@/hooks/use-service-providers";
import { Input as SearchInput } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { ServiceProvider } from "@/lib/api-types";
import { humanizeApiError } from "@/lib/api-error";

const EDITOR_ROLES = new Set(["OWNER", "MANAGER", "FRONT_DESK"]);

/**
 * The garages this company sends its vehicles to (docs/FLEET.md). Private
 * to the organization — providers don't have accounts in the first
 * release; staff record each provider's estimates and bills themselves.
 */
export default function ProvidersPage() {
  const { me } = useAuth();
  const canEdit = !!me?.staffMember && EDITOR_ROLES.has(me.staffMember.role);
  const [showInactive, setShowInactive] = useState(false);
  const providers = useServiceProviders(showInactive);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Service providers</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">The garages and workshops your vehicles go to.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <DirectoryDialog />
            <ProviderDialog />
          </div>
        )}
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-graphite">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-ink" />
        Show providers you no longer use
      </label>

      {providers.isLoading ? (
        <SkeletonRows count={4} />
      ) : providers.isError ? (
        <EmptyState icon={Building2} title="Couldn't load providers" description={humanizeApiError(providers.error)} />
      ) : (providers.data ?? []).length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No service providers yet"
          description="Add the garages you work with so each repair records who did the work and what they charged."
        />
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {providers.data!.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
              <Building2 className="h-4 w-4 shrink-0 text-graphite" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{p.name}</p>
                <p className="truncate text-[12.5px] text-graphite">
                  {p.phone && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Phone className="h-3 w-3" /> {p.phone}
                    </span>
                  )}
                  {p.phone && p.address && " · "}
                  {p.address}
                </p>
              </div>
              {p.garageOrganizationId && (
                <Badge tone="good">
                  <Link2 className="mr-1 h-3 w-3" /> On Le Garage
                </Badge>
              )}
              {!p.active && <Badge>Inactive</Badge>}
              {canEdit && <ProviderDialog provider={p} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderDialog({ provider }: { provider?: ServiceProvider }) {
  const editing = !!provider;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(provider?.name ?? "");
  const [phone, setPhone] = useState(provider?.phone ?? "");
  const [address, setAddress] = useState(provider?.address ?? "");
  const [notes, setNotes] = useState(provider?.notes ?? "");
  const create = useCreateServiceProvider();
  const update = useUpdateServiceProvider(provider?.id ?? "");
  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (editing) await update.mutateAsync(input);
      else await create.mutateAsync(input);
      toast.success(editing ? "Provider updated" : "Provider added");
      setOpen(false);
      if (!editing) {
        setName("");
        setPhone("");
        setAddress("");
        setNotes("");
      }
    } catch (err) {
      toast.error(editing ? "Couldn't update the provider" : "Couldn't add the provider", { description: humanizeApiError(err) });
    }
  }

  async function toggleActive() {
    try {
      await update.mutateAsync({ active: !provider!.active });
      toast.success(provider!.active ? "Provider marked inactive" : "Provider reactivated");
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't update the provider", { description: humanizeApiError(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        ) : (
          <Button variant="secondary">
            <Plus className="h-3.5 w-3.5" /> Add offline garage
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit provider" : "Add service provider"}</DialogTitle>
          {!editing && <DialogDescription>Only your organization can see this list.</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="provider-name">Name</Label>
            <Input id="provider-name" placeholder="e.g. Kality Truck Service" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="provider-phone">Phone</Label>
              <Input id="provider-phone" placeholder="+2519…" value={phone} onChange={(e) => setPhone(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-address">Location</Label>
              <Input id="provider-address" placeholder="e.g. Kality, Addis Ababa" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-notes">Notes</Label>
            <Textarea id="provider-notes" placeholder="Specialties, contact person, payment terms…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button type="button" variant="ghost" onClick={toggleActive} loading={update.isPending}>
                {provider!.active ? "Mark inactive" : "Reactivate"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} disabled={name.trim().length < 2}>
                {editing ? "Save" : "Add provider"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Garages that use Le Garage themselves (docs/WORK-ORDERS.md). Connecting one
 * means repairs can be sent to it as work orders: the garage accepts, does
 * the work in its own account, and you approve and follow progress here.
 */
function DirectoryDialog() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const directory = useGarageDirectory(search, open);
  const create = useCreateServiceProvider();

  async function connect(g: { organizationId: string; name: string; phone: string | null; address: string | null }) {
    try {
      await create.mutateAsync({ name: g.name, phone: g.phone ?? undefined, address: g.address ?? undefined, garageOrganizationId: g.organizationId });
      toast.success(`${g.name} added`, { description: "You can now send them repairs as work orders." });
    } catch (err) {
      toast.error("Couldn't add the garage", { description: humanizeApiError(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Link2 className="h-3.5 w-3.5" /> Find a garage on Le Garage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Garages on Le Garage</DialogTitle>
          <DialogDescription>Send these garages work orders directly — they accept, post their estimate and progress, and you approve.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <SearchInput placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" autoFocus />
        </div>
        <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {directory.isLoading ? (
            <p className="px-3 py-4 text-[13px] text-graphite">Searching…</p>
          ) : (directory.data ?? []).length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-graphite">No garages found.</p>
          ) : (
            directory.data!.map((g) => (
              <div key={g.organizationId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{g.name}</p>
                  <p className="truncate text-[12px] text-graphite">{[g.address, g.city, g.phone].filter(Boolean).join(" · ")}</p>
                </div>
                {g.serviceProviderId ? (
                  <Badge tone="good">Added</Badge>
                ) : (
                  <Button size="sm" onClick={() => connect(g)} loading={create.isPending}>
                    Add
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
