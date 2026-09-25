import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import {
  SUBMISSION_LIST_COLUMNS,
  groupSubmissionRows,
  type SubmissionColumnKey,
  type SubmissionListRow,
  type SubmissionSortKey,
} from "@/lib/data/submission-report-columns";

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 44, paddingHorizontal: 26, fontSize: 8.5, color: "#1c2029" },
  headerRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 38, height: 38, marginRight: 10, objectFit: "contain" },
  title: { fontSize: 15, fontWeight: 700 },
  subtitle: { fontSize: 9, color: "#5b6472", marginTop: 3 },
  headerBar: { borderBottomWidth: 1.5, borderBottomColor: "#1c2029", paddingBottom: 7, marginBottom: 11 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, fontSize: 8, color: "#5b6472" },

  groupTitle: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 9.5,
    fontWeight: 700,
    backgroundColor: "#f1f3f7",
    paddingVertical: 3.5,
    paddingHorizontal: 5,
  },

  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dfe3ea", minHeight: 18, alignItems: "center" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#9aa3b0", backgroundColor: "#fafbfc", minHeight: 20, alignItems: "center" },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  headCell: { fontWeight: 700, fontSize: 7.5, color: "#3a4250", textTransform: "uppercase" },

  emptyBox: { marginTop: 30, textAlign: "center", color: "#5b6472", fontSize: 10 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 26,
    right: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#8a93a1",
    borderTopWidth: 0.5,
    borderTopColor: "#dfe3ea",
    paddingTop: 5,
  },
});

// Relative weights so wide free-text columns get more room than short ones —
// normalized against whatever's actually selected, not a fixed percentage.
const COLUMN_WEIGHT: Record<SubmissionColumnKey, number> = {
  code: 0.9,
  applicant: 1.6,
  institution: 1.6,
  placement: 1.1,
  awards: 1.4,
  percentage: 0.7,
  grade: 0.6,
  board: 1,
  medium: 0.9,
  roll_no: 0.9,
  contact_no: 1,
  email: 1.5,
  reviewed_by: 1.1,
};

export type SubmissionsListPdfProps = {
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
}: SubmissionsListPdfProps) {
  const labels = new Map(SUBMISSION_LIST_COLUMNS.map((c) => [c.key, c.label]));
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
          groups.map((group) => (
            <View key={group.key} wrap>
              <Text style={styles.groupTitle}>
                {group.label} — {group.rows.length} student{group.rows.length === 1 ? "" : "s"}
              </Text>

              <View style={styles.headRow}>
                {columns.map((key) => (
                  <Text key={key} style={[styles.cell, styles.headCell, { width: widthOf(key) }]}>
                    {labels.get(key)}
                  </Text>
                ))}
              </View>

              {group.rows.map((row, index) => (
                <View key={`${group.key}-${row.code}-${index}`} style={styles.row} wrap={false}>
                  {columns.map((key) => (
                    <Text key={key} style={[styles.cell, { width: widthOf(key) }]}>
                      {row[key] || "—"}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))
        )}

        {rows.length > 0 && (
          <Text style={{ marginTop: 12, fontSize: 8.5, color: "#3a4250" }}>Total: {rows.length}</Text>
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
