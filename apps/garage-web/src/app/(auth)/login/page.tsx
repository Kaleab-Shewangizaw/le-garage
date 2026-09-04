"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { humanizeApiError } from "@/lib/api-error";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ identifier, password });
      router.push("/overview");
    } catch (err) {
      setError(humanizeApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h1 className="text-[17px] font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-[13px] text-graphite">Welcome back — pick up where you left off.</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email or phone</Label>
            <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <FieldError>{error ?? undefined}</FieldError>
          <Button type="submit" className="w-full" loading={submitting} disabled={!identifier || !password}>
            Sign in
          </Button>
        </form>
      </CardContent>
      <div className="border-t border-line px-6 py-4 text-center text-[13px] text-graphite">
        Setting up a new garage?{" "}
        <Link href="/register" className="font-medium text-ink underline underline-offset-2">
          Create an account
        </Link>
      </div>
    </Card>
  );
}
