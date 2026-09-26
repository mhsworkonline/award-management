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
import type { StandardReport } from "@/lib/data/submission-reports";

// Wrap at spaces only — react-pdf's default hyphenation split header words ("STU-DENTS").
Font.registerHyphenationCallback((word) => [word]);

const createStyles = (scale: number) => {
  const f = (size: number) => Math.round(size * scale * 10) / 10;
  return StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 44, paddingHorizontal: 30, fontSize: f(9), color: "#1c2029" },
    headerRow: { flexDirection: "row", alignItems: "center" },
    logo: { width: 38, height: 38, marginRight: 10, objectFit: "contain" },
    title: { fontSize: f(15), fontWeight: 700 },
    subtitle: { fontSize: f(9), color: "#5b6472", marginTop: 3 },
    headerBar: { borderBottomWidth: 1.5, borderBottomColor: "#1c2029", paddingBottom: 7, marginBottom: 11 },
    meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, fontSize: f(8), color: "#5b6472" },

    row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dfe3ea", minHeight: 20, alignItems: "center" },
    headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#9aa3b0", backgroundColor: "#fafbfc", minHeight: 24, alignItems: "center" },
    totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#9aa3b0", backgroundColor: "#f1f3f7", minHeight: 22, alignItems: "center" },
    cell: { paddingVertical: 4, paddingHorizontal: 4 },
    headCell: { fontWeight: 700, fontSize: f(8), color: "#3a4250", textTransform: "uppercase" },
    cLabel: { textAlign: "left" },
    cNum: { textAlign: "center" },

    emptyBox: { marginTop: 30, textAlign: "center", color: "#5b6472", fontSize: f(10) },

    footer: {
      position: "absolute",
      bottom: 22,
      left: 30,
      right: 30,
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

export type ApplicationsByStandardPdfProps = {
  /** Scales every font size — see lib/pdf/text-size.ts. */
  textSize: PdfTextSize;
  report: StandardReport;
  academicYearLabel: string;
  organizationName: string;
  /** Public URL of a raster (PNG/JPG/WEBP) logo, or null to omit it. */
  logoUrl: string | null;
  /** Replaces the default subtitle line when set; the org name above it is
   *  always shown regardless. */
  customTitle: string | null;
};

export function ApplicationsByStandardPdf({
  report,
  academicYearLabel,
  organizationName,
  logoUrl,
  customTitle,
  textSize,
}: ApplicationsByStandardPdfProps) {
  const styles = createStyles(pdfScale(textSize));
  const { categories, rows } = report;
  const labelWidth = 26;
  const totalsWidth = 12; // Total Students, Awarded each
  const categoryWidth = categories.length > 0 ? (100 - labelWidth - totalsWidth * 2) / categories.length : 0;

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalStudents += r.totalStudents;
      acc.awarded += r.awarded;
      for (const c of categories) acc.categoryCounts[c.id] = (acc.categoryCounts[c.id] ?? 0) + (r.categoryCounts[c.id] ?? 0);
      return acc;
    },
    { totalStudents: 0, awarded: 0, categoryCounts: {} as Record<string, number> },
  );

  return (
    <Document title={customTitle || "Applications by Standard"} author={organizationName} subject={academicYearLabel}>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.headerBar} fixed>
          <View style={styles.headerRow}>
            {logoUrl && <Image src={logoUrl} style={styles.logo} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{organizationName}</Text>
              <Text style={styles.subtitle}>{customTitle || "Applications by Standard — approved applications only"}</Text>
            </View>
          </View>
          <View style={styles.meta}>
            <Text>Academic year: {academicYearLabel}</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.emptyBox}>No approved applications for this academic year.</Text>
        ) : (
          <View>
            <View style={styles.headRow} fixed>
              <Text style={[styles.cell, styles.headCell, styles.cLabel, { width: `${labelWidth}%` }]}>
                Standard
              </Text>
              <Text style={[styles.cell, styles.headCell, styles.cNum, { width: `${totalsWidth}%` }]}>
                Total Students
              </Text>
              <Text style={[styles.cell, styles.headCell, styles.cNum, { width: `${totalsWidth}%` }]}>
                Awarded
              </Text>
              {categories.map((c) => (
                <Text
                  key={c.id}
                  style={[styles.cell, styles.headCell, styles.cNum, { width: `${categoryWidth}%` }]}
                >
                  {c.name}
                </Text>
              ))}
            </View>

            {rows.map((row) => (
              <View key={row.key} style={styles.row} wrap={false}>
                <Text style={[styles.cell, styles.cLabel, { width: `${labelWidth}%` }]}>{row.label}</Text>
                <Text style={[styles.cell, styles.cNum, { width: `${totalsWidth}%` }]}>{row.totalStudents}</Text>
                <Text style={[styles.cell, styles.cNum, { width: `${totalsWidth}%` }]}>{row.awarded}</Text>
                {categories.map((c) => (
                  <Text key={c.id} style={[styles.cell, styles.cNum, { width: `${categoryWidth}%` }]}>
                    {row.categoryCounts[c.id] ?? 0}
                  </Text>
                ))}
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={[styles.cell, styles.cLabel, { width: `${labelWidth}%`, fontWeight: 700 }]}>
                Total
              </Text>
              <Text style={[styles.cell, styles.cNum, { width: `${totalsWidth}%`, fontWeight: 700 }]}>
                {totals.totalStudents}
              </Text>
              <Text style={[styles.cell, styles.cNum, { width: `${totalsWidth}%`, fontWeight: 700 }]}>
                {totals.awarded}
              </Text>
              {categories.map((c) => (
                <Text
                  key={c.id}
                  style={[styles.cell, styles.cNum, { width: `${categoryWidth}%`, fontWeight: 700 }]}
                >
                  {totals.categoryCounts[c.id] ?? 0}
                </Text>
              ))}
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{organizationName} · Award Management</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderApplicationsByStandardPdf(props: ApplicationsByStandardPdfProps) {
  const element = <ApplicationsByStandardPdf {...props} /> as React.ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
