/** Text size choices for the report PDFs. No react-pdf import here on purpose:
 *  the option picker (a client component) and the PDF renderers (server) both
 *  read this list, so adding a size is one entry. `scale` multiplies every
 *  font size in the renderer's stylesheet. */
export const PDF_TEXT_SIZES = [
  { key: "normal", label: "Normal", scale: 1 },
  { key: "large", label: "Large", scale: 1.25 },
  { key: "xlarge", label: "Extra large", scale: 1.5 },
] as const;

export type PdfTextSize = (typeof PDF_TEXT_SIZES)[number]["key"];

export const DEFAULT_PDF_TEXT_SIZE: PdfTextSize = "large";

export function parsePdfTextSize(raw: string | null | undefined): PdfTextSize {
  return PDF_TEXT_SIZES.find((s) => s.key === raw)?.key ?? DEFAULT_PDF_TEXT_SIZE;
}

export function pdfScale(size: PdfTextSize): number {
  return PDF_TEXT_SIZES.find((s) => s.key === size)!.scale;
}
