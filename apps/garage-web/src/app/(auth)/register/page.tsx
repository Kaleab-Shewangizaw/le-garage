"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { humanizeApiError } from "@/lib/api-error";

export default function RegisterPage() {
  const { registerOrganization } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    organizationName: "",
    garageName: "",
    ownerFullName: "",
    ownerEmail: "",
    ownerPhone: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    form.organizationName && form.garageName && form.ownerFullName && (form.ownerEmail || form.ownerPhone) && form.password.length >= 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerOrganization({
        organizationName: form.organizationName,
        garageName: form.garageName,
        ownerFullName: form.ownerFullName,
        ownerEmail: form.ownerEmail || undefined,
        ownerPhone: form.ownerPhone || undefined,
        password: form.password,
      });
      router.push("/overview");
    } catch (err) {
      setError(humanizeApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h1 className="text-[17px] font-semibold text-ink">Set up your garage</h1>
        <p className="mt-1 text-[13px] text-graphite">A couple of details and you&apos;re in.</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="garageName">Garage name</Label>
            <Input id="garageName" placeholder="e.g. Bole Auto Care" value={form.garageName} onChange={set("garageName")} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="organizationName">Business name</Label>
            <Input id="organizationName" placeholder="Often the same as your garage name" value={form.organizationName} onChange={set("organizationName")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ownerFullName">Your name</Label>
            <Input id="ownerFullName" value={form.ownerFullName} onChange={set("ownerFullName")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ownerEmail">Email</Label>
              <Input id="ownerEmail" type="email" value={form.ownerEmail} onChange={set("ownerEmail")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ownerPhone">Phone</Label>
              <Input id="ownerPhone" value={form.ownerPhone} onChange={set("ownerPhone")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
          </div>
          <FieldError>{error ?? undefined}</FieldError>
          <Button type="submit" className="w-full" loading={submitting} disabled={!canSubmit}>
            Create garage
          </Button>
        </form>
      </CardContent>
      <div className="border-t border-line px-6 py-4 text-center text-[13px] text-graphite">
        Already set up?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-2">
          Sign in
        </Link>
      </div>
    </Card>
  );
}
