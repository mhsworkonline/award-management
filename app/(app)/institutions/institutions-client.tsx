"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { deleteConfig } from "@/lib/actions/settings";
import type { Institution, Lookups } from "@/lib/types";

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
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Institution | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Institution | null>(null);
  const [term, setTerm] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");

  // Small dataset — filtering client-side keeps this page instant.
  const filtered = institutions.filter((i) => {
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (!term.trim()) return true;
    const needle = term.trim().toLowerCase();
    return (
      i.name.toLowerCase().includes(needle) ||
      (i.city ?? "").toLowerCase().includes(needle) ||
      (i.contact_person ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <PageHeader
        title="Institutions"
        description="Schools and colleges participating in the award programme."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Add institution
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name, city or contact…"
          className="max-w-sm"
          aria-label="Search institutions"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="school">Schools</SelectItem>
            <SelectItem value="college">Colleges</SelectItem>
          </SelectContent>
        </Select>
        <p className="ml-auto text-[13px] text-muted-foreground">
          <span className="tabular font-medium text-foreground">{filtered.length}</span> of{" "}
          {institutions.length}
        </p>
      </div>

      <TableWrap className="max-h-[calc(100vh-290px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">Institution</TableHead>
              <TableHead className="w-[10%]">Type</TableHead>
              <TableHead className="w-[14%]">Board</TableHead>
              <TableHead className="w-[12%]">Medium</TableHead>
              <TableHead className="w-[14%]">City</TableHead>
              <TableHead className="w-[16%]">Contact</TableHead>
              <TableHead className="w-[8%] text-right">Students</TableHead>
              <TableHead className="w-[4%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="border-b-0">
                  <EmptyState
                    icon={School}
                    title={institutions.length === 0 ? "No institutions yet" : "No matches"}
                    description={
                      institutions.length === 0
                        ? "Add the schools and colleges whose students receive awards."
                        : "Try a different search term or type filter."
                    }
                    action={
                      institutions.length === 0 ? (
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
              filtered.map((i) => (
                <TableRow key={i.id}>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(i);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/students?institution_id=${i.id}`}>
                            <Users /> View students
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setPendingDelete(i)}>
                          <Trash2 /> Delete
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

      <InstitutionSheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        institution={editing}
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
