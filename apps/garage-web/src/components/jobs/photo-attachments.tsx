"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileText, Loader2, Trash2 } from "lucide-react";
import type { AttachmentEntityType, AttachmentTag } from "@le-garage/types";
import type { Attachment } from "@/lib/api-types";
import { useAttachments, useUploadAttachment, useDeleteAttachment, useAttachmentUrl } from "@/hooks/use-files";
import { humanizeApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { ImageViewer } from "@/components/jobs/image-viewer";
import { ATTACHMENT_TAG_LABEL } from "@/lib/job-labels";

const MAX_FILES_PER_BATCH = 6;

/**
 * Photo evidence for the workflow this product exists for (brief §3):
 * intake condition, damage, diagnosis, completed work. Deliberately
 * job-level (not split per diagnosis entry) — one place to look, matching
 * how a mechanic actually thinks about "photos of this car" rather than
 * "photos of this specific finding."
 */
export function PhotoAttachments({
  entityType,
  entityId,
  tagOptions,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  /** When given, new photos are labelled with the chosen tag (e.g. "Before repair") — proof of what each photo shows. */
  tagOptions?: AttachmentTag[];
}) {
  const [nextTag, setNextTag] = useState<AttachmentTag | undefined>(tagOptions?.[0]);
  const attachments = useAttachments(entityType, entityId);
  const upload = useUploadAttachment(entityType, entityId);
  const remove = useDeleteAttachment(entityType, entityId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const images = attachments.data?.filter((a) => a.mimeType.startsWith("image/")) ?? [];

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, MAX_FILES_PER_BATCH);
    setUploadingCount(list.length);
    let failures = 0;
    for (const file of list) {
      try {
        await upload.mutateAsync({ file, tag: nextTag });
      } catch (err) {
        failures += 1;
        toast.error(`Couldn't upload ${file.name}`, { description: humanizeApiError(err) });
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
    if (failures === 0 && list.length > 0) {
      toast.success(list.length === 1 ? "Photo added" : `${list.length} photos added`);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      {tagOptions && (
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Label for new photos">
          <span className="mr-1 text-[11.5px] text-muted">New photos show:</span>
          {tagOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              role="radio"
              aria-checked={nextTag === tag}
              onClick={() => setNextTag(tag)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                nextTag === tag ? "bg-ink text-paper" : "bg-black/[0.05] text-graphite hover:bg-black/[0.08]",
              )}
            >
              {ATTACHMENT_TAG_LABEL[tag]}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {attachments.data?.map((a) => (
          <AttachmentTile
            key={a.id}
            attachment={a}
            onOpen={a.mimeType.startsWith("image/") ? () => setViewerIndex(images.findIndex((i) => i.id === a.id)) : undefined}
            onRemove={() => remove.mutate(a.id, { onError: (err) => toast.error("Couldn't remove photo", { description: humanizeApiError(err) }) })}
          />
        ))}

        {Array.from({ length: uploadingCount }).map((_, i) => (
          <div key={`uploading-${i}`} className="flex h-20 w-20 items-center justify-center rounded-md border border-line bg-paper">
            <Loader2 className="h-4 w-4 animate-spin text-graphite" />
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-graphite transition-colors hover:border-ink hover:text-ink"
        >
          <Camera className="h-4 w-4" strokeWidth={1.75} />
          <span className="text-[10.5px] font-medium">Add photo</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <ImageViewer images={images} index={viewerIndex} onOpenChange={(open) => !open && setViewerIndex(null)} onNavigate={setViewerIndex} />
    </div>
  );
}

function AttachmentTile({ attachment, onOpen, onRemove }: { attachment: Attachment; onOpen?: () => void; onRemove: () => void }) {
  const signed = useAttachmentUrl(attachment.id);
  const isImage = attachment.mimeType.startsWith("image/");
  const [hover, setHover] = useState(false);

  const content = (
    <>
      {isImage && signed.data?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signed.data.url} alt={attachment.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <FileText className="h-5 w-5 text-graphite" strokeWidth={1.5} />
      )}
      <TagStrip attachment={attachment} />
    </>
  );

  const removeButton = (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
      className={cn(
        "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/80 text-paper transition-opacity",
        hover ? "opacity-100" : "opacity-0",
      )}
    >
      <Trash2 className="h-3 w-3" />
    </button>
  );

  // Images open in the in-app viewer — never a new tab (docs/UX.md). Other
  // file types (e.g. PDFs) have no in-app preview built, so they still open
  // in a new tab; that's a deliberately smaller scope, not an oversight.
  // Not a <button>: the remove control inside it is a button, and buttons can't nest.
  if (isImage) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={attachment.caption ?? "Open photo"}
        onClick={() => onOpen?.()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen?.())}
        className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-line bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        {content}
        {removeButton}
      </div>
    );
  }

  return (
    <a
      href={signed.data?.url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-line bg-paper"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => !signed.data?.url && e.preventDefault()}
    >
      {content}
      {removeButton}
    </a>
  );
}

function TagStrip({ attachment }: { attachment: Attachment }) {
  if (!attachment.tag) return null;
  return (
    <span className="absolute inset-x-0 bottom-0 truncate bg-ink/70 px-1 py-0.5 text-center text-[9.5px] font-medium text-paper">
      {ATTACHMENT_TAG_LABEL[attachment.tag]}
    </span>
  );
}

/**
 * Read-only photo row with the in-app viewer — used where photos are shown
 * as a record (a vehicle's visit history) rather than being added to.
 */
export function PhotoStrip({ attachments, size = "md" }: { attachments: Attachment[]; size?: "md" | "lg" }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  if (attachments.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <ReadOnlyTile
            key={a.id}
            attachment={a}
            size={size}
            onOpen={a.mimeType.startsWith("image/") ? () => setViewerIndex(images.findIndex((i) => i.id === a.id)) : undefined}
          />
        ))}
      </div>
      <ImageViewer images={images} index={viewerIndex} onOpenChange={(open) => !open && setViewerIndex(null)} onNavigate={setViewerIndex} />
    </>
  );
}

function ReadOnlyTile({ attachment, onOpen, size }: { attachment: Attachment; onOpen?: () => void; size: "md" | "lg" }) {
  const signed = useAttachmentUrl(attachment.id);
  const box = size === "lg" ? "h-28 w-36" : "h-20 w-24";
  const isImage = attachment.mimeType.startsWith("image/");
  const inner = (
    <>
      {isImage && signed.data?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signed.data.url} alt={attachment.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <FileText className="h-5 w-5 text-graphite" strokeWidth={1.5} />
      )}
      <TagStrip attachment={attachment} />
    </>
  );
  const className = cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-paper", box);
  if (isImage) {
    return (
      <button type="button" onClick={onOpen} className={className} title={attachment.caption ?? undefined}>
        {inner}
      </button>
    );
  }
  return (
    <a href={signed.data?.url ?? "#"} target="_blank" rel="noreferrer" className={className} title={attachment.caption ?? undefined}>
      {inner}
    </a>
  );
}
