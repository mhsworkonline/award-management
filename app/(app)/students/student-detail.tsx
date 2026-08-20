"use client";

import Link from "next/link";
import { Award, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { placementLabel } from "@/lib/placement";
import { formatDateTime, studentName } from "@/lib/utils";
import type { AcademicRecordRow } from "@/lib/types";

export function StudentDetail({
  record,
  onOpenChange,
  onEdit,
}: {
  record: AcademicRecordRow | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (record: AcademicRecordRow) => void;
}) {
  return (
    <Sheet open={Boolean(record)} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        {record && (
          <>
            <SheetHeader>
              <SheetTitle>{record.students ? studentName(record.students) : "—"}</SheetTitle>
              <SheetDescription>
                {record.students?.middle_name ? `s/o ${record.students.middle_name} · ` : ""}
                {record.institutions?.name ?? "—"}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <Item label="Institution" value={record.institutions?.name} />
                <Item
                  label="Type"
                  value={record.institutions?.type === "college" ? "College" : "School"}
                />
                <Item label="Standard / Course" value={placementLabel(record)} />
                <Item label="Academic year" value={record.academic_years?.label} />
                <Item label="Roll / GR no" value={record.roll_no} />
                <Item label="Email" value={record.students?.email} />
                <Item label="Contact no" value={record.students?.contact_no} />
                <Item label="Percentage" value={record.percentage !== null ? `${record.percentage}%` : null} />
                <Item label="Grade" value={record.grade} />
                <Item label="Rank" value={record.rank !== null ? String(record.rank) : null} />
              </dl>

              {record.remarks && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                      Remarks
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed">{record.remarks}</p>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Awards this year
                </p>
                {record.student_awards && record.student_awards.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {record.student_awards.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-[13px] font-medium">
                          <Award className="h-3.5 w-3.5 text-primary" />
                          {a.award_categories?.name ?? "—"}
                        </span>
                        {a.subject_or_criteria && (
                          <Badge variant="outline">{a.subject_or_criteria}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    No awards assigned yet.{" "}
                    <Link href="/awards" className="font-medium text-primary hover:underline">
                      Assign one
                    </Link>
                    .
                  </p>
                )}
              </div>

              <p className="text-[12px] text-muted-foreground">
                Enrolled {formatDateTime(record.created_at)}
              </p>
            </SheetBody>

            <SheetFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => onEdit(record)}>
                <Pencil /> Edit
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Item({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13.5px]">{value || "—"}</dd>
    </div>
  );
}
