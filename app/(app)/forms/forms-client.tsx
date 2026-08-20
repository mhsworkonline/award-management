"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, FileEdit, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { FormSheet } from "./form-sheet";
import { deleteApplicationForm, toggleApplicationForm } from "@/lib/actions/application-forms";
import { formatDateTime } from "@/lib/utils";
import type { ApplicationFormRow, Lookups } from "@/lib/types";

export function FormsClient({ forms, lookups }: { forms: ApplicationFormRow[]; lookups: Lookups }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ApplicationFormRow | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ApplicationFormRow | null>(null);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => setOrigin(window.location.origin), []);

  function copyLink(slug: string) {
    navigator.clipboard?.writeText(`${origin}/apply/${slug}`).then(
      () => toast.success("Link copied"),
      () => {},
    );
  }

  async function onToggle(form: ApplicationFormRow) {
    const result = await toggleApplicationForm(form.id, !form.is_enabled);
    if (!result.ok) {
      toast.error("Could not update", { description: result.error });
      return;
    }
    toast.success(form.is_enabled ? "Form disabled" : "Form enabled");
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Forms"
        description="Public application links students can submit through — each one is independently trackable and can be turned off."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> New form
          </Button>
        }
      />

      <TableWrap className="max-h-[calc(100vh-260px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[24%]">Title</TableHead>
              <TableHead className="w-[20%]">Link</TableHead>
              <TableHead className="w-[15%]">Academic year</TableHead>
              <TableHead className="w-[12%] text-right">Submissions</TableHead>
              <TableHead className="w-[13%]">Created</TableHead>
              <TableHead className="w-[10%]">Status</TableHead>
              <TableHead className="w-[6%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forms.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-b-0">
                  <EmptyState
                    icon={FileEdit}
                    title="No forms yet"
                    description="Create a public application link students can submit through."
                    action={
                      <Button
                        onClick={() => {
                          setEditing(null);
                          setOpen(true);
                        }}
                      >
                        <Plus /> New form
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              forms.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.title}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code className="truncate text-[12px] text-muted-foreground">/apply/{f.slug}</code>
                      <Button variant="ghost" size="icon-sm" onClick={() => copyLink(f.slug)} aria-label="Copy link">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" asChild aria-label="Open link">
                        <Link href={`/apply/${f.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{f.academic_years?.label ?? "—"}</TableCell>
                  <TableCell className="tabular text-right">
                    <Link href={`/submissions?status=all`} className="font-medium text-primary hover:underline">
                      {f.submission_count ?? 0}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(f.created_at)}</TableCell>
                  <TableCell>
                    <button type="button" onClick={() => void onToggle(f)}>
                      <Badge variant={f.is_enabled ? "success" : "outline"} className="cursor-pointer">
                        {f.is_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </button>
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
                            setEditing(f);
                            setOpen(true);
                          }}
                        >
                          <FileEdit /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setPendingDelete(f)}>
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

      <FormSheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        form={editing}
        lookups={lookups}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.title}"?`}
        description={
          (pendingDelete?.submission_count ?? 0) > 0
            ? `This form has ${pendingDelete?.submission_count} submission(s) — they stay on record, just unlinked from this form. This cannot be undone.`
            : "This cannot be undone."
        }
        onConfirm={async () => {
          const result = await deleteApplicationForm(pendingDelete!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </>
  );
}
