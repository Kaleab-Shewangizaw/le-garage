"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function RootPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? "/overview" : "/login");
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="flex h-dvh items-center justify-center bg-paper">
      <Loader2 className="h-5 w-5 animate-spin text-graphite" />
    </div>
  );
}
