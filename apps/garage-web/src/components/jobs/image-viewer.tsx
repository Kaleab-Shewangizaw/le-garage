"use client";

import { useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useAttachmentUrl } from "@/hooks/use-files";
import type { Attachment } from "@/lib/api-types";
import { cn } from "@/lib/utils";

/**
 * A full-screen in-app viewer for job photos — clicking a thumbnail should
 * never send someone to a new browser tab just to see a picture of their
 * own job's car. Reuses the signed URL each thumbnail already fetched
 * (same react-query cache key), so opening any already-rendered photo is
 * instant.
 */
export function ImageViewer({
  images,
  index,
  onOpenChange,
  onNavigate,
}: {
  images: Attachment[];
  index: number | null;
  onOpenChange: (open: boolean) => void;
  onNavigate: (index: number) => void;
}) {
  const open = index !== null;
  const current = index !== null ? images[index] : undefined;
  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") onNavigate(((index as number) + 1) % images.length);
      if (e.key === "ArrowLeft") onNavigate(((index as number) - 1 + images.length) % images.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, images.length, onNavigate]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/90 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center outline-none data-[state=open]:animate-fade-in"
          onClick={() => onOpenChange(false)}
        >
          <DialogPrimitive.Title className="sr-only">Photo</DialogPrimitive.Title>
          {current && <ViewerImage key={current.id} attachment={current} />}

          <DialogPrimitive.Close
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-paper/90 transition-colors hover:bg-black/50 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/50"
            onClick={(e) => e.stopPropagation()}
          >
            <X className="h-4.5 w-4.5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(((index as number) - 1 + images.length) % images.length);
                }}
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-paper/90 transition-colors hover:bg-black/50 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/50 sm:left-4"
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="sr-only">Previous photo</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(((index as number) + 1) % images.length);
                }}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-paper/90 transition-colors hover:bg-black/50 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/50 sm:right-4"
              >
                <ChevronRight className="h-5 w-5" />
                <span className="sr-only">Next photo</span>
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-2.5 py-1 font-mono text-[11px] text-paper/90">
                {(index as number) + 1} / {images.length}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ViewerImage({ attachment }: { attachment: Attachment }) {
  const signed = useAttachmentUrl(attachment.id);

  if (!signed.data?.url) {
    return (
      <div className="flex h-16 w-16 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-paper/70" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signed.data.url}
      alt=""
      className={cn("max-h-[85vh] max-w-[92vw] rounded-sm object-contain shadow-overlay sm:max-w-[85vw]")}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
