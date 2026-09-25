"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { INSTITUTION_TYPE_OPTIONS, type InstitutionTypeKey } from "@/lib/data/submission-report-columns";

/** Schools / Colleges checkboxes. Nothing (or everything) ticked both mean
 *  "all types" — the report only narrows once exactly one is ticked. */
export function InstitutionTypeFilter({
  value,
  onChange,
}: {
  value: ReadonlySet<InstitutionTypeKey>;
  onChange: (next: Set<InstitutionTypeKey>) => void;
}) {
  const allSelected = value.size === 0 || value.size === INSTITUTION_TYPE_OPTIONS.length;

  function toggle(key: InstitutionTypeKey, checked: boolean) {
    const next = new Set(allSelected ? INSTITUTION_TYPE_OPTIONS.map((o) => o.key) : value);
    if (checked) next.add(key);
    else next.delete(key);
    // Unticking the last one, or ticking every one, both mean "all types".
    onChange(next.size === 0 || next.size === INSTITUTION_TYPE_OPTIONS.length ? new Set() : next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">Institution types</span>
      <div className="flex h-9 items-center gap-4">
        {INSTITUTION_TYPE_OPTIONS.map((o) => (
          <label key={o.key} className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox
              checked={allSelected || value.has(o.key)}
              onCheckedChange={(v) => toggle(o.key, v === true)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
