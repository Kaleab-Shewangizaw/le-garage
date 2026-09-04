"use client";

import { useMemo, useState } from "react";
import { Search, Wrench } from "lucide-react";
import { useJobs } from "@/hooks/use-jobs";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobRow } from "@/components/jobs/job-row";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { NewJobSheet } from "@/components/jobs/new-job-sheet";
import { Button } from "@/components/ui/button";
import type { JobListItem } from "@/lib/api-types";

type BoardTab = "active" | "ready" | "collected" | "all";

const DONE_STATUSES = new Set(["COLLECTED", "CLOSED", "CANCELLED"]);

function filterByTab(jobs: JobListItem[], tab: BoardTab): JobListItem[] {
  switch (tab) {
    case "active":
      return jobs.filter((j) => !DONE_STATUSES.has(j.status));
    case "ready":
      return jobs.filter((j) => j.status === "READY");
    case "collected":
      return jobs.filter((j) => j.status === "COLLECTED" || j.status === "CLOSED");
    default:
      return jobs;
  }
}

export default function JobsPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<BoardTab>("active");
  const jobs = useJobs({ search: search || undefined });

  const filtered = useMemo(() => filterByTab(jobs.data ?? [], tab), [jobs.data, tab]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Jobs</h1>
          <p className="mt-0.5 text-[13.5px] text-graphite">Every vehicle currently in the system.</p>
        </div>
        <NewJobSheet trigger={<Button>New job</Button>} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as BoardTab)}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="ready">Ready for pickup</TabsTrigger>
            <TabsTrigger value="collected">Collected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input placeholder="Search plate or customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      {jobs.isLoading ? (
        <SkeletonRows count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={search ? "No jobs match that search" : "No jobs here"}
          description={search ? "Try a different plate or customer name." : "New jobs will show up here as vehicles come in."}
        />
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {filtered.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
