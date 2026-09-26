"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type FilterOption = { value: string; label: string };

/** A dropdown of checkboxes for in-browser table filters — the same control the
 *  Submissions table uses for Institution and Standard/Course. An empty
 *  selection means "no filter". `searchable` adds a search box for long lists. */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: FilterOption[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  searchable?: boolean;
}) {
  const [search, setSearch] = React.useState("");

  function toggle(value: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(value);
    else next.delete(value);
    onChange(next);
  }

  const shown = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  return (
    <Popover onOpenChange={(open) => !open && setSearch("")}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-[170px] items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        >
          <span className="truncate text-left">{selected.size === 0 ? label : `${selected.size} selected`}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <p className="mb-2 text-[13px] font-semibold">{label}</p>
        {searchable && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="mb-2 h-8"
            aria-label={`Search ${label.toLowerCase()}`}
          />
        )}
        <div className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto">
          {shown.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-accent"
            >
              <Checkbox checked={selected.has(o.value)} onCheckedChange={(v) => toggle(o.value, v === true)} />
              <span className="truncate" title={o.label}>
                {o.label}
              </span>
            </label>
          ))}
          {shown.length === 0 && (
            <p className="px-1.5 py-2 text-[13px] text-muted-foreground">
              {options.length === 0 ? "Nothing to filter by." : "No matches."}
            </p>
          )}
        </div>
        {selected.size > 0 && (
          <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onChange(new Set())}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
