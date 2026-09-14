"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** URL is the single source of truth for filters, sorting and pagination — so
 *  every list view is shareable, bookmarkable and back-button correct. */
export function useQueryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const setParams = React.useCallback(
    (
      updates: Record<string, string | number | null | undefined>,
      opts?: { resetPage?: boolean; keepAllValue?: boolean },
    ) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        // "all" normally means "no filter", so it's dropped from the URL
        // rather than written out — that matches most list pages, where an
        // absent param already means "show everything". A page whose default
        // (absent-param) view is something narrower than "all" — Submissions
        // defaults to "pending" — needs `keepAllValue` so "all" survives as a
        // real, explicit value instead of collapsing back to that default.
        const dropAll = value === "all" && !opts?.keepAllValue;
        if (value === null || value === undefined || value === "" || dropAll) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }

      if (opts?.resetPage !== false && !("page" in updates)) next.delete("page");

      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const clearParams = React.useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const key of keep) {
        const value = searchParams.get(key);
        if (value) next.set(key, value);
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  return { searchParams, setParams, clearParams, pending };
}
