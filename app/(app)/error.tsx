"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  const isConnectivity =
    /fetch failed|network|ENOTFOUND|ECONNREFUSED|timeout/i.test(error.message);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/12 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p className="text-base font-semibold">
        {isConnectivity ? "Cannot reach the database" : "Something went wrong"}
      </p>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {isConnectivity
          ? "Check your connection and try again. Gift check-offs recorded offline are safe on this device and will sync once the connection returns."
          : error.message}
      </p>
      <Button onClick={reset} className="mt-2">
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
