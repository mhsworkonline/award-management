import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { ReportRow } from "@/lib/data/reports";

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 44, paddingHorizontal: 30, fontSize: 9, color: "#1c2029" },
  title: { fontSize: 15, fontWeight: 700 },
  subtitle: { fontSize: 9, color: "#5b6472", marginTop: 3 },
  headerBar: { borderBottomWidth: 1.5, borderBottomColor: "#1c2029", paddingBottom: 7, marginBottom: 11 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, fontSize: 8, color: "#5b6472" },

  groupTitle: {
    marginTop: 13,
    marginBottom: 5,
    fontSize: 10.5,
    fontWeight: 700,
    backgroundColor: "#f1f3f7",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },

  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dfe3ea", minHeight: 19, alignItems: "center" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#9aa3b0", backgroundColor: "#fafbfc", minHeight: 20, alignItems: "center" },
  cell: { paddingVertical: 3.5, paddingHorizontal: 4 },
  headCell: { fontWeight: 700, fontSize: 8, color: "#3a4250", textTransform: "uppercase" },

  cSr: { width: "5%" },
  cName: { width: "23%" },
  cFather: { width: "18%" },
  cPlacement: { width: "14%" },
  cAward: { width: "13%" },
  cGift: { width: "17%" },
  cSign: { width: "10%", textAlign: "center" },

  emptyBox: { marginTop: 30, textAlign: "center", color: "#5b6472", fontSize: 10 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#8a93a1",
    borderTopWidth: 0.5,
    borderTopColor: "#dfe3ea",
    paddingTop: 5,
  },
  totals: { marginTop: 14, flexDirection: "row", gap: 22, fontSize: 8.5, color: "#3a4250" },
});

export type DistributionListProps = {
  rows: ReportRow[];
  filterDescription: string;
  organizationName: string;
  generatedAt: string;
  /** Group by institution so each institution's list can be torn off separately. */
  groupByInstitution: boolean;
  showSignatureColumn: boolean;
};

export function DistributionListPdf({
  rows,
  filterDescription,
  organizationName,
  generatedAt,
  groupByInstitution,
  showSignatureColumn,
}: DistributionListProps) {
  const groups = groupByInstitution ? groupRows(rows) : [{ title: null, rows }];
  const distributed = rows.filter((r) => r.distribution === "Distributed").length;
  const pending = rows.filter((r) => r.distribution === "Pending").length;

  return (
    <Document
      title="Award Distribution List"
      author={organizationName}
      subject={filterDescription}
    >
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.headerBar} fixed>
          <Text style={styles.title}>{organizationName}</Text>
          <Text style={styles.subtitle}>Annual Merit Award — Prize Distribution List</Text>
          <View style={styles.meta}>
            <Text>{filterDescription}</Text>
            <Text>Generated {generatedAt}</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.emptyBox}>
            No records match the selected filters.
          </Text>
        ) : (
          groups.map((group) => (
            <View key={group.title ?? "all"} wrap>
              {group.title && (
                <Text style={styles.groupTitle}>
                  {group.title} — {group.rows.length} student{group.rows.length === 1 ? "" : "s"}
                </Text>
              )}

              <View style={styles.headRow} fixed={!group.title}>
                <Text style={[styles.cell, styles.headCell, styles.cSr]}>#</Text>
                <Text style={[styles.cell, styles.headCell, styles.cName]}>Student</Text>
                <Text style={[styles.cell, styles.headCell, styles.cFather]}>Father</Text>
                <Text style={[styles.cell, styles.headCell, styles.cPlacement]}>Std / Course</Text>
                <Text style={[styles.cell, styles.headCell, styles.cAward]}>Award</Text>
                <Text style={[styles.cell, styles.headCell, styles.cGift]}>Gift</Text>
                <Text style={[styles.cell, styles.headCell, styles.cSign]}>
                  {showSignatureColumn ? "Signature" : "Status"}
                </Text>
              </View>

              {group.rows.map((row, index) => (
                <View key={`${group.title}-${index}`} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, styles.cSr]}>{index + 1}</Text>
                  <Text style={[styles.cell, styles.cName]}>{row.student_name}</Text>
                  <Text style={[styles.cell, styles.cFather]}>{row.father_name || "—"}</Text>
                  <Text style={[styles.cell, styles.cPlacement]}>{row.placement}</Text>
                  <Text style={[styles.cell, styles.cAward]}>{row.awards || "—"}</Text>
                  <Text style={[styles.cell, styles.cGift]}>{row.gifts || "—"}</Text>
                  <Text style={[styles.cell, styles.cSign]}>
                    {showSignatureColumn ? "" : row.distribution}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}

        {rows.length > 0 && (
          <View style={styles.totals}>
            <Text>Total: {rows.length}</Text>
            <Text>Distributed: {distributed}</Text>
            <Text>Pending: {pending}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{organizationName} · Award Management</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Kept next to the document so the renderer cast lives in one place. */
export function renderDistributionListPdf(props: DistributionListProps) {
  const element = <DistributionListPdf {...props} /> as React.ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

function groupRows(rows: ReportRow[]) {
  const map = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = row.institution_name || "Unassigned";
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([title, groupRows]) => ({ title, rows: groupRows }));
}
