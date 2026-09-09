"use client";

import { Download, DatabaseBackup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
 *  No external service, no credentials, nothing that can expire or need
 *  re-authorizing — the tradeoff against a real Google Drive integration
 *  is these can't record a Drive link back into the database for you;
 *  you'd drag the ZIP's contents into Drive yourself afterward, same as
 *  saving it anywhere else. */
export function BackupSection({ isAdmin }: { isAdmin: boolean }) {
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
          <Button asChild>
            <a href="/api/backup/attachments-zip">
              <Download /> Download all files (ZIP)
            </a>
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
            <Button asChild variant="secondary">
              <a href="/api/backup/full-backup">
                <DatabaseBackup /> Download full backup (ZIP)
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && <RestoreSection />}
    </div>
  );
}
