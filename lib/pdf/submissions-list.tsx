import React from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import { pdfScale, type PdfTextSize } from "@/lib/pdf/text-size";
import {
  groupSubmissionRows,
  submissionColumnLabels,
  type SubmissionColumnKey,
  type SubmissionListRow,
  type SubmissionSortKey,
} from "@/lib/data/submission-report-columns";

// Wrap at spaces only — react-pdf's default hyphenation split header words ("STU-DENTS").
Font.registerHyphenationCallback((word) => [word]);

const createStyles = (scale: number) => {
  const f = (size: number) => Math.round(size * scale * 10) / 10;
  return StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 44, paddingHorizontal: 26, fontSize: f(8.5), color: "#1c2029" },
    headerRow: { flexDirection: "row", alignItems: "center" },
    logo: { width: 38, height: 38, marginRight: 10, objectFit: "contain" },
    title: { fontSize: f(15), fontWeight: 700 },
    subtitle: { fontSize: f(9), color: "#5b6472", marginTop: 3 },
    headerBar: { borderBottomWidth: 1.5, borderBottomColor: "#1c2029", paddingBottom: 7, marginBottom: 11 },
    meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, fontSize: f(8), color: "#5b6472" },

    groupTitle: {
      marginTop: 12,
      marginBottom: 4,
      fontSize: f(9.5),
      fontWeight: 700,
      backgroundColor: "#f1f3f7",
      paddingVertical: 3.5,
      paddingHorizontal: 5,
    },

    row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dfe3ea", minHeight: 18, alignItems: "center" },
    headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#9aa3b0", backgroundColor: "#fafbfc", minHeight: 20, alignItems: "center" },
    cell: { paddingVertical: 3, paddingHorizontal: 4 },
    headCell: { fontWeight: 700, fontSize: f(7.5), color: "#3a4250", textTransform: "uppercase" },

    emptyBox: { marginTop: 30, textAlign: "center", color: "#5b6472", fontSize: f(10) },

    footer: {
      position: "absolute",
      bottom: 22,
      left: 26,
      right: 26,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: f(7.5),
      color: "#8a93a1",
      borderTopWidth: 0.5,
      borderTopColor: "#dfe3ea",
      paddingTop: 5,
    },
  });
};

// Relative weights so wide free-text columns get more room than short ones —
// normalized against whatever's actually selected, not a fixed percentage.
const COLUMN_WEIGHT: Record<SubmissionColumnKey, number> = {
  code: 0.9,
  applicant: 1.6,
  institution: 1.6,
  placement: 1.1,
  awards: 1.4,
  percentage: 1.2,
  grade: 0.85,
  board: 1,
  medium: 0.9,
  roll_no: 0.9,
  contact_no: 1,
  email: 1.5,
  reviewed_by: 1.1,
};

// A4 landscape minus the 26pt page margins, and the header font / cell padding the
// stylesheet uses — enough to estimate whether a header word fits its column.
const USABLE_WIDTH = 841.89 - 52;
const HEAD_FONT = 7.5;
const HEAD_CHAR_EM = 0.72; // average width of a bold uppercase character, in ems
const CELL_PADDING = 8;

/** The text scale actually used: the requested one, stepped down (never below
 *  Normal) until the longest word of every column heading fits its column.
 *  Without this, picking many columns at a large size printed headings on top
 *  of each other — a heading like "PERCENTAGE" can't wrap, so it must fit. */
function fitScale(
  requested: number,
  columns: SubmissionColumnKey[],
  labels: Map<SubmissionColumnKey, string>,
): number {
  const totalWeight = columns.reduce((sum, key) => sum + (COLUMN_WEIGHT[key] ?? 1), 0) || 1;
  for (let scale = requested; scale > 1; scale = Math.round((scale - 0.05) * 100) / 100) {
    const fits = columns.every((key) => {
      const longestWord = Math.max(...(labels.get(key) ?? "").split(/\s+/).map((w) => w.length));
      const width = ((COLUMN_WEIGHT[key] ?? 1) / totalWeight) * USABLE_WIDTH;
      return longestWord * HEAD_FONT * scale * HEAD_CHAR_EM + CELL_PADDING <= width;
    });
    if (fits) return scale;
  }
  return 1;
}

export type SubmissionsListPdfProps = {
  /** Scales every font size — see lib/pdf/text-size.ts. */
  textSize: PdfTextSize;
  rows: SubmissionListRow[];
  columns: SubmissionColumnKey[];
  sort: SubmissionSortKey;
  academicYearLabel: string;
  organizationName: string;
  /** Public URL of a raster (PNG/JPG/WEBP) logo, or null to omit it. */
  logoUrl: string | null;
  /** Replaces the default subtitle line when set; the org name above it is
   *  always shown regardless. */
  customTitle: string | null;
};

export function SubmissionsListPdf({
  rows,
  columns,
  sort,
  academicYearLabel,
  organizationName,
  logoUrl,
  customTitle,
  textSize,
}: SubmissionsListPdfProps) {
  const labels = submissionColumnLabels(rows);
  const styles = createStyles(fitScale(pdfScale(textSize), columns, labels));
  const totalWeight = columns.reduce((sum, key) => sum + (COLUMN_WEIGHT[key] ?? 1), 0) || 1;
  const widthOf = (key: SubmissionColumnKey) => `${((COLUMN_WEIGHT[key] ?? 1) / totalWeight) * 100}%`;
  const groups = groupSubmissionRows(rows, sort);

  return (
    <Document title={customTitle || "Approved Applications"} author={organizationName} subject={academicYearLabel}>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.headerBar} fixed>
          <View style={styles.headerRow}>
            {logoUrl && <Image src={logoUrl} style={styles.logo} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{organizationName}</Text>
              <Text style={styles.subtitle}>{customTitle || "Approved Applications List"}</Text>
            </View>
          </View>
          <View style={styles.meta}>
            <Text>Academic year: {academicYearLabel}</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.emptyBox}>No approved applications for this academic year.</Text>
        ) : (
          groups.map((group) => {
            const renderRow = (row: SubmissionListRow, index: number) => (
              <View key={`${group.key}-${row.code}-${index}`} style={styles.row} wrap={false}>
                {columns.map((key) => (
                  <Text key={key} style={[styles.cell, { width: widthOf(key) }]}>
                    {row[key] || "—"}
                  </Text>
                ))}
              </View>
            );
            return (
              <View key={group.key} wrap>
                {/* Heading, column headers and first row are one unbreakable block, so a heading can
                 *  never be stranded (and clipped) at the foot of a page — the block moves to the next. */}
                <View wrap={false}>
                  <Text style={styles.groupTitle}>{group.label}</Text>
                  <View style={styles.headRow}>
                    {columns.map((key) => (
                      <Text key={key} style={[styles.cell, styles.headCell, { width: widthOf(key) }]}>
                        {labels.get(key)}
                      </Text>
                    ))}
                  </View>
                  {group.rows.slice(0, 1).map((row, i) => renderRow(row, i))}
                </View>
                {group.rows.slice(1).map((row, i) => renderRow(row, i + 1))}
              </View>
            );
          })
        )}

        {rows.length > 0 && (
          <Text style={{ marginTop: 12, fontSize: 8.5 * pdfScale(textSize), color: "#3a4250" }}>Total: {rows.length}</Text>
        )}

        <View style={styles.footer} fixed>
          <Text>{organizationName} · Award Management</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderSubmissionsListPdf(props: SubmissionsListPdfProps) {
  const element = <SubmissionsListPdf {...props} /> as React.ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
