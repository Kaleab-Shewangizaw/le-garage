"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileText, Loader2, Trash2 } from "lucide-react";
import type { AttachmentEntityType } from "@le-garage/types";
import type { Attachment } from "@/lib/api-types";
import { useAttachments, useUploadAttachment, useDeleteAttachment, useAttachmentUrl } from "@/hooks/use-files";
import { humanizeApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { ImageViewer } from "@/components/jobs/image-viewer";

const MAX_FILES_PER_BATCH = 6;

/**
 * Photo evidence for the workflow this product exists for (brief §3):
 * intake condition, damage, diagnosis, completed work. Deliberately
 * job-level (not split per diagnosis entry) — one place to look, matching
 * how a mechanic actually thinks about "photos of this car" rather than
 * "photos of this specific finding."
 */
export function PhotoAttachments({ entityType, entityId }: { entityType: AttachmentEntityType; entityId: string }) {
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
        await upload.mutateAsync({ file });
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

  const content = isImage && signed.data?.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={signed.data.url} alt="" className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <FileText className="h-5 w-5 text-graphite" strokeWidth={1.5} />
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
  if (isImage) {
    return (
      <button
        type="button"
        onClick={() => onOpen?.()}
        className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-line bg-paper"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {content}
        {removeButton}
      </button>
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
