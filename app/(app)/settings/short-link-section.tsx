"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "@/components/ui/table";
import { Field } from "@/components/form/field";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { createShortLink, deleteShortLink } from "@/lib/actions/short-links";
import { formatDateTime } from "@/lib/utils";
import { usePermissions } from "@/components/providers/permissions-provider";
import type { ShortLink } from "@/lib/types";

/** Self-hosted short links — paste a URL, get back yourapp.com/s/xyz1234.
 *  Replaced the earlier TinyURL integration: that free/anonymous endpoint
 *  turned out to route through a "deprecated" interstitial and then a
 *  third-party ad redirector before reaching the real destination, broken
 *  outright for anyone with an ad blocker. This one never leaves our own
 *  domain. Unlike the QR generator, links here genuinely have to persist —
 *  something has to remember what a code points to — so this list is real
 *  stored state, not a stateless regenerate-on-demand tool. */
export function ShortLinkSection({ links }: { links: ShortLink[] }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canDelete = can("settings", "delete");
  const [origin, setOrigin] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [justCreated, setJustCreated] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ShortLink | null>(null);

  React.useEffect(() => setOrigin(window.location.origin), []);

  async function create() {
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

    setCreating(true);
    const result = await createShortLink(normalized);
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setJustCreated(result.data.code);
    setUrl("");
    router.refresh();
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success("Copied"),
      () => {},
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Shorten a link</CardTitle>
          <CardDescription>
            Paste any link and get a short link back on our own domain — handy for SMS, print, or
            anywhere a long URL doesn&apos;t fit. Self-hosted, so it never routes through a third
            party.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="URL" htmlFor="short_link_url" error={error ?? undefined}>
            <div className="flex gap-2">
              <Input
                id="short_link_url"
                placeholder="https://…"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void create();
                  }
                }}
              />
              <Button type="button" onClick={() => void create()} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Link2 />}
                Shorten
              </Button>
            </div>
          </Field>

          {justCreated && origin && (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-5">
              <a
                href={`${origin}/s/${justCreated}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline"
              >
                {origin}/s/{justCreated}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button type="button" variant="outline" size="sm" onClick={() => copy(`${origin}/s/${justCreated}`)}>
                <Copy /> Copy link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previously created</CardTitle>
            <CardDescription>Most recent first.</CardDescription>
          </CardHeader>
          <CardContent>
            <TableWrap className="max-h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Short link</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-[12px]">
                        <button
                          type="button"
                          onClick={() => copy(`${origin}/s/${l.code}`)}
                          className="flex items-center gap-1.5 hover:underline"
                          title="Copy"
                        >
                          /s/{l.code}
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-[13px] text-muted-foreground" title={l.target_url}>
                        {l.target_url}
                      </TableCell>
                      <TableCell className="tabular text-right">{l.click_count}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(l.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" asChild aria-label="Open link">
                            <a href={`${origin}/s/${l.code}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete link"
                              onClick={() => setPendingDelete(l)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this short link?"
        description="Anyone who still has it will get a 'link not found' page. This cannot be undone."
        onConfirm={async () => {
          const result = await deleteShortLink(pendingDelete!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </div>
  );
}
