import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { ApplyForm } from "@/app/apply/apply-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getPublicBranding } from "@/lib/actions/organization";
import { getPublicFormOptions } from "@/lib/actions/public-application";
import { ORG_ID } from "@/lib/constants";
import { canAccess, createClient } from "@/lib/supabase/server";
import { T } from "@/lib/tables";
import type { ApplicationForm, ResolvedForm } from "@/lib/types";

export const metadata = { title: "Add student" };

/** Staff-only entry point to an application form — same fields and rules as
 *  the public /apply page, but reachable while the form is disabled, and it
 *  submits through a permission-gated action. Lands as a normal Pending
 *  submission, so it goes through the usual review/approve step. */
export default async function AddStudentPage({ params }: { params: { id: string } }) {
  if (!(await canAccess("submissions", "create"))) {
    return (
      <>
        <PageHeader title="Add student" />
        <p className="rounded-lg border bg-card p-6 text-[14px] text-muted-foreground">
          You don&apos;t have permission to add students here. Ask an admin to grant Submissions: Create.
        </p>
      </>
    );
  }

  const supabase = createClient();
  const { data } = await supabase
    .from(T.applicationForms)
    .select("*, academic_years:am_academic_years ( id, label )")
    .eq("org_id", ORG_ID)
    .eq("id", params.id)
    .eq("form_type", "apply")
    .maybeSingle();
  if (!data) notFound();

  const row = data as unknown as ApplicationForm & { academic_years: { id: string; label: string } | null };
  if (!row.academic_years) notFound();

  const form: NonNullable<ResolvedForm> = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    titleGu: row.title_gu,
    description: row.description,
    descriptionGu: row.description_gu,
    is_enabled: row.is_enabled,
    fieldConfig: row.field_config,
    academicYear: row.academic_years,
  };

  const [optionsResult, branding] = await Promise.all([getPublicFormOptions(), getPublicBranding()]);
  if (!optionsResult.ok) {
    return (
      <>
        <PageHeader title="Add student" />
        <p className="rounded-lg border bg-card p-6 text-[14px] text-destructive">{optionsResult.error}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Add student"
        description={`Enter an application on a student's behalf — ${form.title} (${form.academicYear.label}).`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/forms">
              <ArrowLeft /> Back to Forms
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-xl space-y-3">
        <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Private staff entry
          {form.is_enabled ? "" : " — this form is closed to the public, but you can still add students here."}
        </p>
        <ApplyForm form={form} options={optionsResult.data} branding={branding} staff />
      </div>
    </>
  );
}
