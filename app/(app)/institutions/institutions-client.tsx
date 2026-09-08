"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  FileSpreadsheet,
  GraduationCap,
  MoreHorizontal,
  Pencil,
  Plus,
  School,
  SquarePen,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { InstitutionSheet } from "./institution-sheet";
import { InstitutionBulkEditSheet } from "./institution-bulk-edit-sheet";
import { deleteConfig } from "@/lib/actions/settings";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/components/providers/permissions-provider";
import type { Institution, Lookups } from "@/lib/types";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 500] as const;

type SortKey = "name" | "type" | "board" | "medium" | "city" | "contact" | "students";
type SortDir = "asc" | "desc";

const SORT_VALUE: Record<SortKey, (i: Institution, studentCounts: Record<string, number>) => string | number> = {
  name: (i) => i.name.toLowerCase(),
  type: (i) => i.type,
  board: (i) => (i.boards?.name ?? "").toLowerCase(),
  medium: (i) => (i.mediums?.name ?? "").toLowerCase(),
  city: (i) => (i.city ?? "").toLowerCase(),
  contact: (i) => (i.contact_person ?? i.contact_no ?? "").toLowerCase(),
  students: (i, counts) => counts[i.id] ?? 0,
};

export function InstitutionsClient({
  institutions,
  studentCounts,
  lookups,
}: {
  institutions: Institution[];
  studentCounts: Record<string, number>;
  lookups: Lookups;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canCreate = can("institutions", "create");
  const canUpdate = can("institutions", "update");
  const canDelete = can("institutions", "delete");
  const canViewStudents = can("students", "read");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Institution | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Institution | null>(null);
  const [term, setTerm] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [boardFilter, setBoardFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const filtered = institutions.filter((i) => {
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (boardFilter !== "all" && i.board_id !== boardFilter) return false;
    if (!term.trim()) return true;
    const needle = term.trim().toLowerCase();
    return (
      i.name.toLowerCase().includes(needle) ||
      (i.city ?? "").toLowerCase().includes(needle) ||
      (i.contact_person ?? "").toLowerCase().includes(needle)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = SORT_VALUE[sortKey](a, studentCounts);
    const bv = SORT_VALUE[sortKey](b, studentCounts);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Filters/search/sort/page-size changing the visible set out from under a
  // stale page number would otherwise land on an empty page.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const clampedPage = Math.min(page, pageCount);
  const from = sorted.length === 0 ? 0 : (clampedPage - 1) * pageSize;
  const paginated = sorted.slice(from, from + pageSize);

  function resetToFirstPage() {
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of paginated) {
        if (checked) next.add(i.id);
        else next.delete(i.id);
      }
      return next;
    });
  }

  const allOnPageSelected = paginated.length > 0 && paginated.every((i) => selected.has(i.id));
  const selectedInstitutions = institutions.filter((i) => selected.has(i.id));

  return (
    <>
      <PageHeader
        title="Institutions"
        description="Schools and colleges participating in the award programme."
        actions={
          canCreate && (
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <FileSpreadsheet /> Import
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/institutions/import/school">
                      <School /> Import schools
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/institutions/import/college">
                      <GraduationCap /> Import colleges
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus /> Add institution
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            resetToFirstPage();
          }}
          placeholder="Search by name, city or contact…"
          className="max-w-sm"
          aria-label="Search institutions"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="school">Schools</SelectItem>
            <SelectItem value="college">Colleges</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={boardFilter}
          onValueChange={(v) => {
            setBoardFilter(v);
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-[160px]">
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
        <p className="ml-auto text-[13px] text-muted-foreground">
          <span className="tabular font-medium text-foreground">{filtered.length}</span> of{" "}
          {institutions.length}
        </p>
      </div>

      {canUpdate && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-primary/[0.04] px-4 py-2.5">
          <p className="text-[13px] font-medium">
            {selected.size} institution{selected.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setBulkEditOpen(true)}>
              <SquarePen /> Edit selected
            </Button>
          </div>
        </div>
      )}

      <TableWrap className="max-h-[calc(100vh-320px)]">
        <Table>
          <TableHeader>
            <TableRow>
              {canUpdate && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(c) => toggleAllOnPage(Boolean(c))}
                    aria-label="Select all institutions on this page"
                  />
                </TableHead>
              )}
              <SortableHead sortKey="name" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-[26%]">
                Institution
              </SortableHead>
              <SortableHead sortKey="type" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-[10%]">
                Type
              </SortableHead>
              <SortableHead sortKey="board" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-[13%]">
                Board
              </SortableHead>
              <SortableHead sortKey="medium" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-[11%]">
                Medium
              </SortableHead>
              <SortableHead sortKey="city" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-[13%]">
                City
              </SortableHead>
              <SortableHead sortKey="contact" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-[15%]">
                Contact
              </SortableHead>
              <SortableHead
                sortKey="students"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="w-[8%] justify-end text-right"
                align="right"
              >
                Students
              </SortableHead>
              <TableHead className="w-[4%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginated.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={canUpdate ? 9 : 8} className="border-b-0">
                  <EmptyState
                    icon={School}
                    title={institutions.length === 0 ? "No institutions yet" : "No matches"}
                    description={
                      institutions.length === 0
                        ? "Add the schools and colleges whose students receive awards."
                        : "Try a different search term or type filter."
                    }
                    action={
                      institutions.length === 0 && canCreate ? (
                        <Button
                          onClick={() => {
                            setEditing(null);
                            setFormOpen(true);
                          }}
                        >
                          <Plus /> Add institution
                        </Button>
                      ) : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((i) => (
                <TableRow key={i.id} data-state={selected.has(i.id) ? "selected" : undefined}>
                  {canUpdate && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(i.id)}
                        onCheckedChange={() => toggleRow(i.id)}
                        aria-label={`Select ${i.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>
                    <Badge variant={i.type === "college" ? "default" : "secondary"}>
                      {i.type === "college" ? (
                        <>
                          <GraduationCap className="h-3 w-3" /> College
                        </>
                      ) : (
                        <>
                          <School className="h-3 w-3" /> School
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{i.boards?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{i.mediums?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{i.city ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {i.contact_person || i.contact_no ? (
                      <span className="flex flex-col leading-tight">
                        {i.contact_person && <span>{i.contact_person}</span>}
                        {i.contact_no && (
                          <span className="tabular text-[12px]">{i.contact_no}</span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {studentCounts[i.id] ? (
                      <Link
                        href={`/students?institution_id=${i.id}`}
                        className="tabular font-medium text-primary hover:underline"
                      >
                        {studentCounts[i.id]}
                      </Link>
                    ) : (
                      <span className="tabular text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {(canUpdate || canViewStudents || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate && (
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(i);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                          )}
                          {canViewStudents && (
                            <DropdownMenuItem asChild>
                              <Link href={`/students?institution_id=${i.id}`}>
                                <Users /> View students
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem destructive onClick={() => setPendingDelete(i)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <p className="tabular text-[13px] text-muted-foreground">
          {sorted.length === 0
            ? "No records"
            : `${from + 1}–${Math.min(from + pageSize, sorted.length)} of ${sorted.length.toLocaleString("en-IN")}`}
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                resetToFirstPage();
              }}
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
              disabled={clampedPage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="tabular px-1 text-[13px] text-muted-foreground">
              {clampedPage} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={clampedPage >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <InstitutionSheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        institution={editing}
        lookups={lookups}
      />

      <InstitutionBulkEditSheet
        open={bulkEditOpen}
        onOpenChange={(open) => {
          setBulkEditOpen(open);
          if (!open) setSelected(new Set());
        }}
        selected={selectedInstitutions}
        lookups={lookups}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "institution"}?`}
        description={
          studentCounts[pendingDelete?.id ?? ""] > 0
            ? `This institution has ${studentCounts[pendingDelete!.id]} student record(s). Deleting it removes those students, their awards and their gift allocations.`
            : "This cannot be undone."
        }
        onConfirm={async () => {
          const result = await deleteConfig("institutions", pendingDelete!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </>
  );
}

function SortableHead({
  sortKey,
  current,
  dir,
  onSort,
  children,
  className,
  align,
}: {
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
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
