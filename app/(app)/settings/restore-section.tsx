"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type RestoreResult = { rowsRestored: Record<string, number>; filesRestored: number };

/** The other half of the full-backup feature. Guarded server-side (the
 *  route refuses unless the database is completely empty), but the two
 *  confirmations here — the checkbox and the native confirm() — exist
 *  because this is still a one-way door for whoever's about to click it:
 *  once rows exist, there's no "undo," only starting over on a fresh
 *  database. Only shown to admins, same as the full-backup download. */
export function RestoreSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function handleRestore() {
    if (!file) return;
    if (
      !window.confirm(
        "This will populate this database from the backup file. It only runs when the database is " +
          "completely empty, and there is no undo once it's done. Continue?",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup/restore", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Restore failed.");
        return;
      }
      setResult(body);
      setFile(null);
      setAcknowledged(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Restore failed — the connection was interrupted before it finished.");
    } finally {
      setBusy(false);
    }
  }

  const totalRows = result ? Object.values(result.rowsRestored).reduce((sum, n) => sum + n, 0) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restore from full backup</CardTitle>
        <CardDescription>
          Rebuilds this database from a full-backup ZIP. Only works when every table is already
          empty — meant for a freshly installed copy of this app, not for merging into one that&apos;s
          already in use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload /> Choose backup ZIP…
          </Button>
          {file && <span className="text-[13px] text-muted-foreground">{file.name}</span>}
        </div>

        {file && (
          <label className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I understand this can only run once, against an empty database, and cannot be undone.
          </label>
        )}

        <Button type="button" disabled={!file || !acknowledged || busy} onClick={handleRestore}>
          {busy ? "Restoring…" : "Restore"}
        </Button>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2.5 text-[13px] font-medium text-destructive">
            {error}
          </p>
        )}

        {result && (
          <p className="flex items-start gap-2 rounded-md border border-success/30 bg-success/8 px-3.5 py-2.5 text-[13px]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>
              Restored {totalRows} rows across {Object.keys(result.rowsRestored).length} tables and{" "}
              {result.filesRestored} files.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
