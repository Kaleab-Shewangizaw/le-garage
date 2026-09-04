"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, UserPlus, Users } from "lucide-react";
import { useCreateCustomer, useCustomers } from "@/hooks/use-customers";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { humanizeApiError } from "@/lib/api-error";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const customers = useCustomers(search || undefined);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Customers</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">Everyone the garage has done business with.</p>
        </div>
        <AddCustomerDialog />
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <Input placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      {customers.isLoading ? (
        <SkeletonRows count={6} />
      ) : (customers.data ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No customers match that search" : "No customers yet"}
          description={search ? undefined : "Add your first customer, or one will be created automatically the next time you intake a vehicle."}
        />
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {customers.data!.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-black/[0.02]">
              <div>
                <p className="text-[13.5px] font-medium text-ink">{c.fullName}</p>
                {c.email && <p className="text-[12px] text-graphite">{c.email}</p>}
              </div>
              <p className="font-mono text-[13px] text-graphite">{c.phone}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AddCustomerDialog() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const create = useCreateCustomer();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ fullName, phone });
      toast.success("Customer added");
      setOpen(false);
      setFullName("");
      setPhone("");
    } catch (err) {
      toast.error("Couldn't add customer", { description: humanizeApiError(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-3.5 w-3.5" /> Add customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!fullName || !phone}>
              Add customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
