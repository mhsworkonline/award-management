"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryParams } from "@/hooks/use-query-params";
import type { Lookups } from "@/lib/types";

/** Both submission-based reports are scoped to exactly one academic year at
 *  a time (unlike the roster report, which can span "all years") — so they
 *  get a plain required year select instead of the full FilterBar. */
export function YearSelect({ lookups }: { lookups: Lookups }) {
  const { searchParams, setParams } = useQueryParams();
  const yearId = searchParams.get("academic_year_id") ?? "";

  return (
    <Select value={yearId} onValueChange={(v) => setParams({ academic_year_id: v })}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select academic year" />
      </SelectTrigger>
      <SelectContent>
        {lookups.academicYears.map((y) => (
          <SelectItem key={y.id} value={y.id}>
            {y.label}
            {y.is_active ? " (active)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
