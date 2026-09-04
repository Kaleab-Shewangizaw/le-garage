import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty states teach, they don't just report absence (docs/UX.md,
 * brief §16 — "no data" is never acceptable copy).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.04]">
          <Icon className="h-5 w-5 text-graphite" strokeWidth={1.75} />
        </div>
      )}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-graphite">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
