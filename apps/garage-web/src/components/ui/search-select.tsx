"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * A minimal search-and-pick list — not a full combobox library. Used for
 * "find or create" lookups (customer/vehicle) in the intake flow
 * (docs/UX.md — search-first, not form-first).
 */
export function SearchSelect<T>({
  placeholder,
  query,
  onQueryChange,
  results,
  isLoading,
  renderResult,
  keyOf,
  onSelect,
  emptyHint,
  recentLabel = "Recent",
}: {
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  results: T[] | undefined;
  isLoading: boolean;
  renderResult: (item: T) => React.ReactNode;
  keyOf: (item: T) => string;
  onSelect: (item: T) => void;
  emptyHint?: string;
  /** Shown as a section label when the query is empty — the backend's "no
   * search term" response is already ordered most-recent-first, so this
   * doubles as a genuine "recently used" shortcut (docs/UX.md §9) at zero
   * extra cost. */
  recentLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  // Focus alone shows results now (not just once typing starts) — an
  // empty query surfaces recently used customers/vehicles, removing a
  // whole round of typing for the common "it's the same customer as last
  // time" case.
  const showResults = focused;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          className="pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showResults && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-overlay animate-fade-in">
          {!isLoading && query.length === 0 && (results?.length ?? 0) > 0 && (
            <div className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{recentLabel}</div>
          )}
          {isLoading && <div className="px-3 py-2.5 text-[13px] text-graphite">Searching…</div>}
          {!isLoading && results?.length === 0 && (
            <div className="px-3 py-2.5 text-[13px] text-graphite">{query ? (emptyHint ?? "No matches") : "Nothing yet"}</div>
          )}
          {!isLoading &&
            results?.map((item) => (
              <button
                key={keyOf(item)}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(item)}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-2 text-left text-[13px] transition-colors hover:bg-black/[0.04]",
                )}
              >
                {renderResult(item)}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
