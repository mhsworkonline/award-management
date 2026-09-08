"use client";

import * as React from "react";
import { Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/form/field";
import { shortenUrl } from "@/lib/actions/tinyurl";

/** Paste a URL, get a tinyurl.com link back. Unlike the QR generator, this
 *  genuinely can't be self-hosted/stateless — a short link only works if
 *  something remembers what it points to, which here is TinyURL's own
 *  service, not us. Nothing is persisted on our side. */
export function TinyUrlSection() {
  const [url, setUrl] = React.useState("");
  const [shortening, setShortening] = React.useState(false);
  const [shortUrl, setShortUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function shorten() {
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

    setShortening(true);
    setShortUrl(null);
    const result = await shortenUrl(normalized);
    setShortening(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShortUrl(result.data.shortUrl);
  }

  function copyLink() {
    if (!shortUrl) return;
    navigator.clipboard?.writeText(shortUrl).then(
      () => toast.success("Copied"),
      () => {},
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shorten a link</CardTitle>
        <CardDescription>
          Paste any link and get a short tinyurl.com link back — handy for SMS, print, or anywhere
          a long URL doesn&apos;t fit. Powered by TinyURL&apos;s public service; nothing is stored
          on our side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="URL" htmlFor="tinyurl_url" error={error ?? undefined}>
          <div className="flex gap-2">
            <Input
              id="tinyurl_url"
              placeholder="https://…"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void shorten();
                }
              }}
            />
            <Button type="button" onClick={() => void shorten()} disabled={shortening}>
              {shortening ? <Loader2 className="animate-spin" /> : <Link2 />}
              Shorten
            </Button>
          </div>
        </Field>

        {shortUrl && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-5">
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline"
            >
              {shortUrl}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              <Copy /> Copy link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
