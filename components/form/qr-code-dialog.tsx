"use client";

import * as React from "react";
import { Copy, Download, Loader2, QrCode as QrCodeIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { generateQrCodeDataUrl } from "@/lib/qrcode";

/** Generic QR code popup — pass it any URL and it renders, copies, and
 *  downloads. Not tied to any one feature (forms, distribution, whatever
 *  comes next); every future "give me a QR for X" need is just another call
 *  site against this same component, not a new one. */
export function QrCodeDialog({
  open,
  onOpenChange,
  url,
  title = "QR code",
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  description?: string;
}) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !url) return;
    setDataUrl(null);
    generateQrCodeDataUrl(url).then(setDataUrl).catch(() => setDataUrl(null));
  }, [open, url]);

  function copyLink() {
    navigator.clipboard?.writeText(url).then(
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCodeIcon className="h-4 w-4" /> {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-white p-3">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL, no next/image benefit
              <img src={dataUrl} alt="QR code" className="h-full w-full" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>

          <button
            type="button"
            onClick={copyLink}
            className="flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-[12px] font-medium hover:bg-muted/70"
            title="Copy link"
          >
            <span className="truncate">{url}</span>
            <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>

          <Button variant="outline" size="sm" disabled={!dataUrl} onClick={downloadPng}>
            <Download /> Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
