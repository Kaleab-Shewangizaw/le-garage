"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { useAdminAudit } from "@/hooks/use-admin";
import { AdminOnly, AuditList } from "@/components/admin/admin-shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { humanizeApiError } from "@/lib/api-error";

const FILTERS = [
  { value: "ALL", label: "Everything" },
  { value: "ADMIN_", label: "Admin actions" },
  { value: "LOGIN", label: "Sign-ins" },
  { value: "APPROVAL", label: "Approvals" },
  { value: "JOB_STATUS", label: "Status changes" },
];

export default function AdminAuditPage() {
  return (
    <AdminOnly>
      <Audit />
    </AdminOnly>
  );
}

function Audit() {
  const [action, setAction] = useState("ALL");
  const audit = useAdminAudit({ action: action === "ALL" ? undefined : action });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Audit log</h1>
        <p className="mt-0.5 text-[13.5px] text-graphite">The latest recorded actions across every organization (newest first, up to 150).</p>
      </div>
      <Tabs value={action} onValueChange={setAction}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {audit.isLoading ? (
        <SkeletonRows count={8} />
      ) : audit.isError ? (
        <EmptyState icon={ScrollText} title="Couldn't load the audit log" description={humanizeApiError(audit.error)} />
      ) : (
        <AuditList entries={audit.data ?? []} showOrganization />
      )}
    </div>
  );
}
