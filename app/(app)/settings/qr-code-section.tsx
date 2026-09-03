"use client";

import * as React from "react";
import { Copy, Download, Loader2, QrCode as QrCodeIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/form/field";
import { generateQrCodeDataUrl } from "@/lib/qrcode";

/** Stateless QR code generator — paste any URL, get a code back. Nothing is
 *  saved: a QR code is fully and deterministically regenerable from its URL,
 *  so there's nothing worth persisting. Deliberately has no idea what the
 *  URL is for — every feature that wants a QR code (Forms' application
 *  link today, whatever else later) comes here and pastes it in, rather
 *  than this page knowing about them. */
export function QrCodeSection() {
  const [url, setUrl] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [generatedFor, setGeneratedFor] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function generate() {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a URL");
      return;
    }
    let normalized: string;
    try {
      normalized = new URL(trimmed).toString();
    } catch {
      setError("Enter a valid URL, including https://");
      return;
    }

    setGenerating(true);
    setDataUrl(null);
    try {
      const generated = await generateQrCodeDataUrl(normalized);
      setDataUrl(generated);
      setGeneratedFor(normalized);
    } catch {
      setError("Could not generate a QR code for this URL");
    } finally {
      setGenerating(false);
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(generatedFor).then(
      () => toast.success("Link copied"),
      () => {},
    );
  }

  function downloadPng() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qr-code.png";
    a.click();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>QR code generator</CardTitle>
        <CardDescription>
          Paste any link — the public application form, a specific form&apos;s link from the Forms
          page, anything else — and get a scannable QR code. Nothing here is saved; generate again
          any time from the same URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="URL" htmlFor="qr_url" error={error ?? undefined}>
          <div className="flex gap-2">
            <Input
              id="qr_url"
              placeholder="https://…"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void generate();
                }
              }}
            />
            <Button type="button" onClick={() => void generate()} disabled={generating}>
              {generating ? <Loader2 className="animate-spin" /> : <QrCodeIcon />}
              Generate
            </Button>
          </div>
        </Field>

        {dataUrl && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-5">
            <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, no next/image benefit */}
              <img src={dataUrl} alt="QR code" className="h-full w-full" />
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="flex max-w-full items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-[12px] font-medium hover:bg-muted/70"
              title="Copy link"
            >
              <span className="max-w-xs truncate">{generatedFor}</span>
              <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <Button type="button" variant="outline" size="sm" onClick={downloadPng}>
              <Download /> Download PNG
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
