import Link from "next/link";
import {
  Award,
  CheckCircle2,
  Clock,
  Gift,
  GraduationCap,
  Package,
  School,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { getDashboardStats } from "@/lib/data/dashboard";
import { activeYearId, getLookups } from "@/lib/data/lookups";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  // If the URL already names a year, stats can be fetched alongside lookups
  // instead of waiting on them just to look up the active year.
  const lookupsPromise = getLookups();
  const [lookups, stats] = searchParams.year
    ? await Promise.all([lookupsPromise, getDashboardStats(searchParams.year)])
    : await lookupsPromise.then(async (l) => [l, await getDashboardStats(activeYearId(l))] as const);
  const yearId = searchParams.year ?? activeYearId(lookups);
  const year = lookups.academicYears.find((y) => y.id === yearId);

  const distributionTotal = stats.distributed + stats.pendingDistribution;
  const progress = distributionTotal === 0 ? 0 : Math.round((stats.distributed / distributionTotal) * 100);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          year
            ? `Overview for academic year ${year.label}`
            : "Create an academic year under Settings to get started"
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/students/import">Import students</Link>
            </Button>
            <Button asChild>
              <Link href="/students/new">Add student</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Users}
          label="Students"
          value={stats.students}
          hint={`${stats.schoolStudents} school · ${stats.collegeStudents} college (all years)`}
          href="/students"
        />
        <Stat
          icon={Award}
          label="Awards assigned"
          value={stats.awards}
          hint={`across ${stats.byCategory.length} categor${stats.byCategory.length === 1 ? "y" : "ies"}`}
          href="/awards"
        />
        <Stat
          icon={Gift}
          label="Gifts allocated"
          value={stats.allocations}
          hint={`${stats.giftStock} units still in stock`}
          href="/gifts"
        />
        <Stat
          icon={CheckCircle2}
          label="Gifts distributed"
          value={stats.distributed}
          hint={`${stats.pendingDistribution} pending${stats.queuedOffline ? ` · ${stats.queuedOffline} synced offline` : ""}`}
          href="/distribution"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Distribution progress</CardTitle>
            <Badge variant={progress === 100 && distributionTotal > 0 ? "success" : "secondary"}>
              {progress}% complete
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Mini icon={Package} label="Allocated" value={distributionTotal} />
              <Mini icon={CheckCircle2} label="Handed out" value={stats.distributed} />
              <Mini icon={Clock} label="Pending" value={stats.pendingDistribution} />
            </div>
            {distributionTotal === 0 && (
              <p className="text-[13px] text-muted-foreground">
                No gifts allocated yet. Assign awards on the{" "}
                <Link href="/awards" className="font-medium text-primary hover:underline">
                  Awards
                </Link>{" "}
                page, then allocate gifts against them.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Awards by category</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byCategory.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No awards assigned yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.byCategory.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate">{c.name}</span>
                    <span className="tabular font-medium">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Top institutions</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/institutions">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.byInstitution.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No students recorded for this year yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {stats.byInstitution.map((i) => (
                  <li key={i.name} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      {i.type === "college" ? (
                        <GraduationCap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <School className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{i.name}</span>
                    </span>
                    <span className="tabular font-medium">{i.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent activity</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/audit">Audit log</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.recentAudit.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant={
                          a.action === "create"
                            ? "success"
                            : a.action === "delete"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {a.action}
                      </Badge>
                      <span className="truncate text-muted-foreground">
                        {a.entity_name.replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {formatDateTime(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-5 shadow-soft transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <p className="tabular mt-2 text-[26px] font-semibold leading-none tracking-tight">
        {value.toLocaleString("en-IN")}
      </p>
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </Link>
  );
}

function Mini({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2.5">
      <Icon className="mx-auto h-4 w-4 text-muted-foreground" />
      <p className="tabular mt-1 text-lg font-semibold leading-none">{value.toLocaleString("en-IN")}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
