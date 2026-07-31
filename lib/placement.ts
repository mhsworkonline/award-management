/** A student is placed either by school standard or by college course + period.
 *  One formatter so every table, PDF and export label them identically. */
export type PlacementSource = {
  period_no?: number | null;
  standards?: { label: string } | null;
  courses?: { name: string; structure_type?: "year" | "semester" | null } | null;
};

export function placementLabel(source: PlacementSource | null | undefined) {
  if (!source) return "—";
  if (source.standards?.label) return source.standards.label;
  if (source.courses?.name) {
    const unit = source.courses.structure_type === "semester" ? "Sem" : "Year";
    return source.period_no
      ? `${source.courses.name} · ${unit} ${source.period_no}`
      : source.courses.name;
  }
  return "—";
}
