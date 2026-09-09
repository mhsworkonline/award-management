"use client";

import { useState } from "react";
import { Download, DatabaseBackup, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { downloadFile } from "@/lib/download-file";
import { RestoreSection } from "./restore-section";

/** Two backups, deliberately kept separate rather than merged into one
 *  "download everything" button:
 *  - Files only: every marksheet + student photo, nothing else. Any
 *    signed-in staff member can already see these one at a time elsewhere
 *    in the app, so a bundle of them isn't a new exposure.
 *  - Full backup: every table as JSON plus the same files, restorable into
 *    a fresh install. This is a full copy of every applicant's personal
 *    data in one file, so it's admin-only (see the /api/backup/full-backup
 *    route, gated by requireAdmin()).
 *
 *  Both routes build the whole ZIP in memory before responding, so a plain
 *  `<a href>` would sit there giving no sign anything was happening —
 *  fetched via downloadFile() instead so the button can show a spinner and
 *  disable itself while it works. This stays non-blocking on purpose: the
 *  operation is read-only and safe, so there's no reason to freeze the
 *  rest of the app while it runs — the busy button is just there so a
 *  second click can't start a second one, and so it's obvious it's
 *  working rather than broken.
 *
 *  No external service, no credentials, nothing that can expire or need
 *  re-authorizing — the tradeoff against a real Google Drive integration
 *  is these can't record a Drive link back into the database for you;
 *  you'd drag the ZIP's contents into Drive yourself afterward, same as
 *  saving it anywhere else. */
export function BackupSection({ isAdmin }: { isAdmin: boolean }) {
  const [filesBusy, setFilesBusy] = useState(false);
  const [fullBusy, setFullBusy] = useState(false);

  async function handleDownload(
    url: string,
    fallbackFilename: string,
    setBusy: (busy: boolean) => void,
  ) {
    setBusy(true);
    try {
      const error = await downloadFile(url, fallbackFilename);
      if (error) toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Download all files</CardTitle>
          <CardDescription>
            Every marksheet attachment and student photo, bundled into one ZIP — a copy you can save
            anywhere (Google Drive, an external drive, wherever) independent of this app. Safe to run
            any time; nothing here is deleted or changed, only read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            disabled={filesBusy}
            onClick={() =>
              handleDownload("/api/backup/attachments-zip", "award-management-files.zip", setFilesBusy)
            }
          >
            {filesBusy ? <Loader2 className="animate-spin" /> : <Download />}
            {filesBusy ? "Preparing…" : "Download all files (ZIP)"}
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Download full backup</CardTitle>
            <CardDescription>
              Everything — every table (students, academic records, awards, gift inventory,
              submissions, and more) as JSON, plus all files, in one ZIP. Built to be re-imported into
              a freshly installed copy of this app. Staff logins can&apos;t be restored this way —
              recreate accounts afterward from Users &amp; Roles. Safe to run any time; nothing here is
              deleted or changed, only read.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="secondary"
              disabled={fullBusy}
              onClick={() =>
                handleDownload(
                  "/api/backup/full-backup",
                  "award-management-full-backup.zip",
                  setFullBusy,
                )
              }
            >
              {fullBusy ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
              {fullBusy ? "Preparing backup…" : "Download full backup (ZIP)"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && <RestoreSection />}
    </div>
  );
}
