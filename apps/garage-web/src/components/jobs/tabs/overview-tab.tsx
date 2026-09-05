"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send, Stethoscope, StickyNote } from "lucide-react";
import type { Job } from "@/lib/api-types";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useAddDiagnosis, useAddJobNote } from "@/hooks/use-jobs";
import { formatDateTime } from "@/lib/format";
import { humanizeApiError } from "@/lib/api-error";
import { Badge } from "@/components/ui/status-pill";
import { PhotoAttachments } from "@/components/jobs/photo-attachments";

const SEVERITY_TONE: Record<string, "neutral" | "attention" | "danger"> = {
  LOW: "neutral",
  MEDIUM: "attention",
  HIGH: "attention",
  CRITICAL: "danger",
};

export function OverviewTab({ job }: { job: Job }) {
  return (
    <div className="space-y-8">
      <Section title="Customer complaint">
        <p className="rounded-md bg-paper px-4 py-3 text-[13.5px] text-ink">{job.complaint}</p>
      </Section>

      <Section title="Photos">
        <PhotoAttachments entityType="JOB" entityId={job.id} />
      </Section>

      <DiagnosisSection job={job} />
      <NotesSection job={job} />
    </div>
  );
}

function DiagnosisSection({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [observedProblem, setObservedProblem] = useState("");
  const [recommendedRepair, setRecommendedRepair] = useState("");
  const [severity, setSeverity] = useState<string>("MEDIUM");
  const addDiagnosis = useAddDiagnosis(job.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!observedProblem.trim()) return;
    try {
      await addDiagnosis.mutateAsync({
        observedProblem,
        recommendedRepair: recommendedRepair || undefined,
        severity: severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      });
      toast.success("Diagnosis added");
      setObservedProblem("");
      setRecommendedRepair("");
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't save the diagnosis", { description: humanizeApiError(err) });
    }
  }

  return (
    <Section title="Diagnosis" action={<Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Add finding"}</Button>}>
      {open && (
        <form onSubmit={handleSubmit} className="space-y-2.5 rounded-md border border-line bg-paper p-3.5">
          <Textarea placeholder="What did you find? e.g. Worn front brake pads, rotor scoring" value={observedProblem} onChange={(e) => setObservedProblem(e.target.value)} rows={2} autoFocus />
          <Textarea placeholder="Recommended repair (optional)" value={recommendedRepair} onChange={(e) => setRecommendedRepair(e.target.value)} rows={2} />
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`rounded-sm px-2 py-1 text-[11.5px] font-medium transition-colors ${severity === s ? "bg-ink text-paper" : "bg-black/[0.04] text-graphite hover:bg-black/[0.08]"}`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <Button type="submit" size="sm" loading={addDiagnosis.isPending} disabled={!observedProblem.trim()}>
              Save
            </Button>
          </div>
        </form>
      )}

      {job.diagnoses.length === 0 && !open ? (
        <EmptyState icon={Stethoscope} title="No diagnosis yet" description="Add what you found once you've had a look at the vehicle." />
      ) : (
        <div className="space-y-2.5">
          {job.diagnoses.map((d) => (
            <div key={d.id} className="rounded-md border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] text-ink">{d.observedProblem}</p>
                {d.severity && <Badge tone={SEVERITY_TONE[d.severity] ?? "neutral"}>{d.severity}</Badge>}
              </div>
              {d.recommendedRepair && <p className="mt-1.5 text-[12.5px] text-graphite">Recommended: {d.recommendedRepair}</p>}
              <p className="mt-2 font-mono text-[11px] text-muted">{formatDateTime(d.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function NotesSection({ job }: { job: Job }) {
  const [text, setText] = useState("");
  const addNote = useAddJobNote(job.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await addNote.mutateAsync({ note: text });
      setText("");
    } catch (err) {
      toast.error("Couldn't save the note", { description: humanizeApiError(err) });
    }
  }

  return (
    <Section title="Notes">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea placeholder="Leave a quick update — e.g. “waiting on customer callback”" value={text} onChange={(e) => setText(e.target.value)} rows={1} className="min-h-[38px] resize-none" />
        <Button type="submit" size="icon" variant="secondary" disabled={!text.trim()} loading={addNote.isPending}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>

      {job.notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" />
      ) : (
        <div className="space-y-2">
          {[...job.notes].reverse().map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-md bg-paper px-3.5 py-2.5">
              <p className="text-[13px] text-ink">{n.note}</p>
              <p className="shrink-0 font-mono text-[11px] text-muted">{formatDateTime(n.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
