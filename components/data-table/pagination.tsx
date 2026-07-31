"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/lib/constants";
import { useQueryParams } from "@/hooks/use-query-params";

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const { setParams } = useQueryParams();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      <p className="tabular text-[13px] text-muted-foreground">
        {total === 0 ? "No records" : `${from}–${to} of ${total.toLocaleString("en-IN")}`}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setParams({ size: v, page: 1 })}
          >
            <SelectTrigger className="h-8 w-[74px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setParams({ page: page - 1 }, { resetPage: false })}
          >
            <ChevronLeft />
          </Button>
          <span className="tabular px-1 text-[13px] text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => setParams({ page: page + 1 }, { resetPage: false })}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
