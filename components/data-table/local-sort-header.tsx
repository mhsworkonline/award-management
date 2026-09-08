"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Click-to-sort column header for a list that's fully client-side (the
 *  whole dataset is already fetched at once — no server round trip to
 *  page/sort against). Visually matches SortHeader (components/data-table/
 *  sort-header.tsx), which does the same job for server-paginated lists
 *  driven by URL search params — this one just holds its state locally
 *  instead, since there's no query to keep in sync. */
export function LocalSortHeader<K extends string>({
  sortKey,
  current,
  dir,
  onSort,
  children,
  className,
  align,
}: {
  sortKey: K;
  current: K;
  dir: "asc" | "desc";
  onSort: (key: K) => void;
  children: React.ReactNode;
  className?: string;
  align?: "right";
}) {
  const active = current === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {children}
        {!active ? (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        ) : dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )}
      </button>
    </TableHead>
  );
}
