"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        // Narrow phones can't fit 5 tab labels — scroll horizontally
        // rather than clipping the last one out of reach (brief §12).
        "flex items-center gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative shrink-0 whitespace-nowrap px-3 py-2 text-[13.5px] font-medium text-graphite transition-colors",
        "hover:text-ink",
        "data-[state=active]:text-ink",
        "after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent data-[state=active]:after:bg-ink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 rounded-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: TabsPrimitive.TabsContentProps) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}
