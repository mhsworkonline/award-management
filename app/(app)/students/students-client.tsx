"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileSpreadsheet,
  GraduationCap,
  MoreHorizontal,
  Pencil,
  Plus,
  School,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { FilterBar } from "@/components/data-table/filter-bar";
import { Pagination } from "@/components/data-table/pagination";
import { SortHeader } from "@/components/data-table/sort-header";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { StudentSheet } from "./student-sheet";
import { StudentDetail } from "./student-detail";
import { deleteStudent } from "@/lib/actions/students";
import { placementLabel } from "@/lib/placement";
import { studentName } from "@/lib/utils";
import type { AcademicRecordRow, Lookups } from "@/lib/types";

export function StudentsClient({
  rows,
  total,
  page,
  size,
  lookups,
  defaultYearId,
  exportQuery,
}: {
  rows: AcademicRecordRow[];
  total: number;
  page: number;
  size: number;
  lookups: Lookups;
  defaultYearId: string | null;
  exportQuery: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<AcademicRecordRow | null>(null);
  const [detail, setDetail] = React.useState<AcademicRecordRow | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AcademicRecordRow | null>(null);

  function openEdit(record: AcademicRecordRow) {
    setDetail(null);
    setEditing(record);
  }

  return (
    <>
      <PageHeader
        title="Students"
        description="Search, filter and record students eligible for merit awards."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/students/import">
                <FileSpreadsheet /> Import
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/reports/excel${exportQuery}`}>
                <Download /> Export
              </a>
            </Button>
            <Button asChild>
              <Link href={`/students/new${defaultYearId ? `?academic_year_id=${defaultYearId}` : ""}`}>
                <Plus /> Add student
              </Link>
            </Button>
          </>
        }
      />

      <FilterBar
        lookups={lookups}
        advanced={[
          "institution_id",
          "institution_type",
          "board_id",
          "medium_id",
          "standard_id",
          "course_id",
          "award_category_id",
        ]}
      />

      <TableWrap className="max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[21%]">Student</TableHead>
              <TableHead className="w-[15%]">Father</TableHead>
              <TableHead className="w-[19%]">Institution</TableHead>
              <TableHead className="w-[11%]">Std / Course</TableHead>
              <TableHead className="w-[8%]">
                <SortHeader column="roll_no">Roll no</SortHeader>
              </TableHead>
              <TableHead className="w-[8%]">
                <SortHeader column="percentage">%</SortHeader>
              </TableHead>
              <TableHead className="w-[14%]">Awards</TableHead>
              <TableHead className="w-[4%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="border-b-0">
                  <EmptyState
                    icon={Users}
                    title="No students found"
                    description="Adjust the filters, or add your first student for this academic year."
                    action={
                      <Button asChild>
                        <Link href={`/students/new${defaultYearId ? `?academic_year_id=${defaultYearId}` : ""}`}>
                          <Plus /> Add student
                        </Link>
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((record) => (
                <TableRow key={record.id} className="cursor-pointer">
                  <TableCell onClick={() => setDetail(record)}>
                    <span className="font-medium">
                      {record.students ? studentName(record.students) : "—"}
                    </span>
                  </TableCell>
                  <TableCell onClick={() => setDetail(record)} className="text-muted-foreground">
                    {record.students?.middle_name || "—"}
                  </TableCell>
                  <TableCell onClick={() => setDetail(record)}>
                    <span className="flex items-center gap-1.5">
                      {record.institutions?.type === "college" ? (
                        <GraduationCap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <School className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{record.institutions?.name ?? "—"}</span>
                    </span>
                  </TableCell>
                  <TableCell onClick={() => setDetail(record)}>
                    <Badge variant="secondary">{placementLabel(record)}</Badge>
                  </TableCell>
                  <TableCell onClick={() => setDetail(record)} className="tabular text-muted-foreground">
                    {record.roll_no || "—"}
                  </TableCell>
                  <TableCell onClick={() => setDetail(record)} className="tabular text-muted-foreground">
                    {record.percentage !== null ? `${record.percentage}%` : "—"}
                  </TableCell>
                  <TableCell onClick={() => setDetail(record)}>
                    {record.student_awards && record.student_awards.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {record.student_awards.map((a) => (
                          <Badge key={a.id} variant="default">
                            {a.award_categories?.name ?? "—"}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(record)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setPendingDelete(record)}>
                          <Trash2 /> Delete student
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <Pagination page={page} pageSize={size} total={total} />

      <StudentSheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        record={editing}
        lookups={lookups}
      />

      <StudentDetail
        record={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        onEdit={openEdit}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.students ? studentName(pendingDelete.students) : "student"}?`}
        description="Deletes the student entirely — every year's enrollment, awards and gift allocations. Allocated gift stock is returned to inventory. This cannot be undone."
        onConfirm={async () => {
          const result = await deleteStudent(pendingDelete!.student_id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </>
  );
}
