"use client";

import { Field } from "@/components/form/field";
import { Input } from "@/components/ui/input";

/** Shared by all three report tabs' "PDF options" — a custom title (plain
 *  text input, replacing the report's default heading on the PDF only, never
 *  Excel) and a toggle to include the org's Settings → Branding logo. Kept
 *  as local component state by each caller (not URL params) — same
 *  ephemeral-until-you-click-Generate treatment as groupByInstitution/
 *  signatureColumn already get on the roster tab. */
export function PdfTitleLogoFields({
  title,
  onTitleChange,
  includeLogo,
  onIncludeLogoChange,
  hasLogo,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  includeLogo: boolean;
  onIncludeLogoChange: (value: boolean) => void;
  hasLogo: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field label="Report title" hint="Printed on the PDF in place of the default heading. Leave blank to use it.">
        <Input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Annual Prize Distribution 2025-26"
          maxLength={120}
        />
      </Field>

      <label
        className={`flex items-start gap-2.5 ${hasLogo ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
      >
        <input
          type="checkbox"
          checked={includeLogo && hasLogo}
          disabled={!hasLogo}
          onChange={(e) => onIncludeLogoChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))] disabled:cursor-not-allowed"
        />
        <span>
          <span className="block text-[13px] font-medium leading-tight">Include logo</span>
          <span className="block text-[12px] text-muted-foreground">
            {hasLogo
              ? "Your organization's logo, from Settings → Branding"
              : "No logo set — add one under Settings → Branding"}
          </span>
        </span>
      </label>
    </div>
  );
}
