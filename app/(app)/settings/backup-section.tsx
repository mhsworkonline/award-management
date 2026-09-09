"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/** Self-contained backup: bundles every marksheet attachment and student
 *  photo into one ZIP you download normally. No external service, no
 *  credentials, nothing that can expire or need re-authorizing — the
 *  tradeoff against a real Google Drive integration is this can't record
 *  a Drive link back into the database for you; you'd drag the ZIP's
 *  contents into Drive yourself afterward, same as saving it anywhere
 *  else. */
export function BackupSection() {
  return (
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
  );
}
