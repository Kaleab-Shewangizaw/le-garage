"use client";

import { use } from "react";
import { useJob } from "@/hooks/use-jobs";
import { JobDetailHeader } from "@/components/jobs/job-detail-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/jobs/tabs/overview-tab";
import { EstimateTab } from "@/components/jobs/tabs/estimate-tab";
import { PartsLaborTab } from "@/components/jobs/tabs/parts-labor-tab";
import { InvoiceTab } from "@/components/jobs/tabs/invoice-tab";
import { ActivityTab } from "@/components/jobs/tabs/activity-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle } from "lucide-react";

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useJob(id);

  if (job.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (job.isError || !job.data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load this job"
        description="It may have been removed, or you may not have access to it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <JobDetailHeader job={job.data} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="estimate">Estimate</TabsTrigger>
          <TabsTrigger value="parts-labor">Parts &amp; labor</TabsTrigger>
          <TabsTrigger value="invoice">Invoice &amp; payment</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <div className="pt-6">
          <TabsContent value="overview">
            <OverviewTab job={job.data} />
          </TabsContent>
          <TabsContent value="estimate">
            <EstimateTab job={job.data} />
          </TabsContent>
          <TabsContent value="parts-labor">
            <PartsLaborTab job={job.data} />
          </TabsContent>
          <TabsContent value="invoice">
            <InvoiceTab job={job.data} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab jobId={job.data.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
