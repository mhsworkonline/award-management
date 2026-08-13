"use client";

import * as React from "react";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field } from "@/components/form/field";
import { useQueryParams } from "@/hooks/use-query-params";
import type { Lookups } from "@/lib/types";

export type FilterKey =
  | "academic_year_id"
  | "institution_id"
  | "institution_type"
  | "board_id"
  | "medium_id"
  | "standard_id"
  | "course_id"
  | "award_category_id"
  | "status";

const LABELS: Record<FilterKey, string> = {
  academic_year_id: "Academic year",
  institution_id: "Institution",
  institution_type: "Institution type",
  board_id: "Board",
  medium_id: "Medium",
  standard_id: "Standard",
  course_id: "Course",
  award_category_id: "Award category",
  status: "Distribution status",
};

/** Search + year stay inline (used constantly); the rest live behind "Filters"
 *  so the toolbar never becomes a wall of dropdowns. */
export function FilterBar({
  lookups,
  advanced,
  searchPlaceholder = "Search by name, father's name or roll no…",
  children,
}: {
  lookups: Lookups;
  advanced: FilterKey[];
  searchPlaceholder?: string;
  children?: React.ReactNode;
}) {
  const { searchParams, setParams, clearParams } = useQueryParams();
  const [term, setTerm] = React.useState(searchParams.get("q") ?? "");

  React.useEffect(() => {
    setTerm(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Debounced search — typing shouldn't fire a query per keystroke.
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (term === current) return;
    const timer = window.setTimeout(() => setParams({ q: term || null }), 300);
    return () => window.clearTimeout(timer);
  }, [term, searchParams, setParams]);

  // Board is the primary bifurcation for schools — promoted out of the
  // "advanced" popover into an always-visible select, same treatment as
  // academic year. Strip it from `advanced` defensively in case a caller
  // still lists it there.
  const boardId = searchParams.get("board_id") ?? "all";
  const advancedKeys = advanced.filter((key) => key !== "board_id");
  const activeAdvanced = advancedKeys.filter((key) => searchParams.get(key));
  const options = optionsFor(lookups, boardId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          aria-label="Search"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {lookups.academicYears.length > 0 && (
        <Select
          value={searchParams.get("academic_year_id") ?? "all"}
          onValueChange={(v) => setParams({ academic_year_id: v })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Academic year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {lookups.academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.label}
                {y.is_active ? " (active)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {lookups.boards.length > 0 && (
        <Select
          value={boardId}
          onValueChange={(v) => setParams({ board_id: v, institution_id: null })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Board" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All boards</SelectItem>
            {lookups.boards.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {advancedKeys.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="default">
              <Filter />
              Filters
              {activeAdvanced.length > 0 && (
                <Badge variant="default" className="ml-0.5">
                  {activeAdvanced.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3.5" align="end">
            <p className="text-[13px] font-semibold">Advanced filters</p>

            {advancedKeys.map((key) => (
              <Field key={key} label={LABELS[key]}>
                <Select
                  value={searchParams.get(key) ?? "all"}
                  onValueChange={(v) => setParams({ [key]: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`All ${LABELS[key].toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {options[key].map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => clearParams(["academic_year_id", "board_id", "q", "size"])}
            >
              Reset advanced filters
            </Button>
          </PopoverContent>
        </Popover>
      )}

      {(activeAdvanced.length > 0 || term || boardId !== "all") && (
        <Button variant="ghost" size="sm" onClick={() => clearParams(["size"])}>
          <X /> Clear all
        </Button>
      )}

      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

function optionsFor(
  lookups: Lookups,
  boardId: string,
): Record<FilterKey, { value: string; label: string }[]> {
  return {
    academic_year_id: lookups.academicYears.map((y) => ({ value: y.id, label: y.label })),
    institution_id: lookups.institutions
      .filter((i) => boardId === "all" || i.board_id === boardId)
      .map((i) => ({
        value: i.id,
        label: `${i.name} (${i.type === "college" ? "College" : "School"})`,
      })),
    institution_type: [
      { value: "school", label: "School" },
      { value: "college", label: "College" },
    ],
    board_id: lookups.boards.map((b) => ({ value: b.id, label: b.name })),
    medium_id: lookups.mediums.map((m) => ({ value: m.id, label: m.name })),
    standard_id: lookups.standards.map((s) => ({ value: s.id, label: s.label })),
    course_id: lookups.courses.map((c) => ({ value: c.id, label: c.name })),
    award_category_id: lookups.awardCategories.map((a) => ({ value: a.id, label: a.name })),
    status: [
      { value: "pending", label: "Pending" },
      { value: "distributed", label: "Distributed" },
    ],
  };
}
