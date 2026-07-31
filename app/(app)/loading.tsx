import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-24" />
      </div>

      <div className="rounded-lg border bg-card shadow-soft">
        <Skeleton className="h-10 w-full rounded-b-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/60 px-3 py-3">
            <Skeleton className="h-4 w-[18%]" />
            <Skeleton className="h-4 w-[14%]" />
            <Skeleton className="h-4 w-[20%]" />
            <Skeleton className="h-4 w-[12%]" />
            <Skeleton className="h-4 w-[16%]" />
          </div>
        ))}
      </div>
    </div>
  );
}
