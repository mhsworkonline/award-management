"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryParams } from "@/hooks/use-query-params";

export function SortHeader({
  column,
  children,
  className,
}: {
  column: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { searchParams, setParams } = useQueryParams();
  const active = searchParams.get("sort") === column;
  const dir = active ? (searchParams.get("dir") ?? "asc") : null;

  return (
    <button
      type="button"
      onClick={() =>
        setParams({ sort: column, dir: active && dir === "asc" ? "desc" : "asc" })
      }
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "text-foreground",
        className,
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
  );
}
