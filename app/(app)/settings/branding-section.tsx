"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/form/field";
import { updateAppName, updateLogo, removeLogo } from "@/lib/actions/organization";
import { createClient } from "@/lib/supabase/client";
import { BRANDING_BUCKET } from "@/lib/tables";
import type { Organization } from "@/lib/types";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** What students see at the top of the public /apply page — name and logo.
 *  A single-row settee (one org), so it's a plain form rather than the
 *  list-style ConfigSection used for boards/mediums/courses. */
export function BrandingSection({ organization }: { organization: Organization }) {
  const router = useRouter();
  const [appName, setAppName] = React.useState(organization.app_name);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(
    organization.logo_path
      ? createClient().storage.from(BRANDING_BUCKET).getPublicUrl(organization.logo_path).data.publicUrl
      : null,
  );
  const [savingName, setSavingName] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const nameChanged = appName.trim() !== organization.app_name;

  async function saveName() {
    setError(null);
    if (!appName.trim()) {
      setError("Name is required");
      return;
    }
    setSavingName(true);
    const result = await updateAppName({ app_name: appName.trim() });
    setSavingName(false);
    if (!result.ok) {
      setError(result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error);
      return;
    }
    toast.success("Application name updated");
    router.refresh();
  }

  async function handleLogoFile(file: File) {
    setError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError("Only PNG, JPEG, WebP or SVG images are allowed");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2MB or smaller");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `logo-${crypto.randomUUID()}.${ext}`;

    const upload = await supabase.storage.from(BRANDING_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upload.error) {
      setUploading(false);
      toast.error("Upload failed", { description: upload.error.message });
      return;
    }

    const result = await updateLogo(path);
    setUploading(false);
    if (!result.ok) {
      toast.error("Could not save logo", { description: result.error });
      return;
    }

    setLogoUrl(supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path).data.publicUrl);
    toast.success("Logo updated");
    router.refresh();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemoveLogo() {
    setRemoving(true);
    const result = await removeLogo();
    setRemoving(false);
    if (!result.ok) {
      toast.error("Could not remove logo", { description: result.error });
      return;
    }
    setLogoUrl(null);
    toast.success("Logo removed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          Shown across the whole app — the public application form, the sign-in page, the sidebar,
          and every browser tab title.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Field
          label="Application name"
          htmlFor="app_name"
          required
          hint="Replaces &quot;Award Management&quot; everywhere it appears."
        >
          <div className="flex gap-2">
            <Input
              id="app_name"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              maxLength={80}
            />
            <Button type="button" onClick={saveName} disabled={savingName || !nameChanged}>
              {savingName ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          </div>
        </Field>

        <Field label="Logo" hint={`Optional — PNG, JPEG, WebP or SVG, up to 2MB. Falls back to a trophy icon when empty.`}>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
                <img src={logoUrl} alt="Current logo" className="h-full w-full object-contain" />
              ) : (
                <Trophy className="h-6 w-6 text-muted-foreground" />
              )}
            </span>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept={ALLOWED_LOGO_TYPES.join(",")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleLogoFile(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {logoUrl && (
                <Button type="button" variant="ghost" size="sm" disabled={removing} onClick={() => void handleRemoveLogo()}>
                  {removing ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Field>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
