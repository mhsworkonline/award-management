"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  ClipboardList,
  FileEdit,
  GraduationCap,
  Gift,
  Inbox,
  LayoutDashboard,
  Menu,
  School,
  ScrollText,
  Settings,
  UserCheck,
  Users,
  FileBarChart,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useOffline } from "@/components/offline/offline-sync-provider";
import type { ModuleName, ModulePermissions } from "@/lib/types";

/** Every entry but Dashboard is gated on Read for its module — see
 *  0022_roles_and_permissions.sql for the same table→module mapping this
 *  mirrors. This is UX only (hides a link a role can't use); RLS on the
 *  underlying tables is the real enforcement either way.
 *
 *  Grouped into two sections rather than one flat list: the last five are
 *  one linear pipeline (enter grades -> decide awards -> pick a gift from
 *  inventory -> hand it over at the ceremony -> report on all of it), and
 *  showing them under their own label makes that sequence visible instead
 *  of looking like five unrelated top-level pages. No functional change —
 *  same routes, same permission gating, just grouped. */
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: null },
      { href: "/submissions", label: "Submissions", icon: Inbox, module: "submissions" },
      { href: "/confirmations", label: "Confirmations", icon: UserCheck, module: "confirmations" },
      { href: "/forms", label: "Forms", icon: FileEdit, module: "forms" },
      { href: "/students", label: "Students", icon: Users, module: "students" },
      { href: "/institutions", label: "Institutions", icon: School, module: "institutions" },
    ],
  },
  {
    label: "Awards ceremony",
    items: [
      { href: "/academic-records/grades", label: "Grade Entry", icon: GraduationCap, module: "academic_records" },
      { href: "/awards", label: "Awards", icon: Award, module: "awards" },
      { href: "/gifts", label: "Gift Inventory", icon: Gift, module: "gifts" },
      { href: "/distribution", label: "Distribution", icon: ClipboardList, module: "distribution" },
      { href: "/reports", label: "Reports", icon: FileBarChart, module: "reports" },
    ],
  },
] as const satisfies readonly {
  label: string | null;
  items: readonly { href: string; label: string; icon: unknown; module: ModuleName | null }[];
}[];

// Audit Log is admin-only (see 0022's am_audit_logs_read policy); Settings
// shows for anyone with Settings:Read, admins additionally get the
// Users & Roles tab inside it (gated separately, see settings-client.tsx).
const FOOTER_NAV = [
  { href: "/audit", label: "Audit Log", icon: ScrollText, adminOnly: true, module: null },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: false, module: "settings" },
] as const satisfies readonly { href: string; label: string; icon: unknown; adminOnly: boolean; module: ModuleName | null }[];

type SidebarProps = {
  pendingSubmissions?: number;
  appName?: string;
  logoUrl?: string | null;
  isAdmin?: boolean;
  modules?: Record<ModuleName, ModulePermissions>;
};

/** The branding header + nav links + footer nav shared by the desktop
 *  `<aside>` and the mobile drawer — one source of truth for the nav tree so
 *  the two surfaces can't drift apart. `onNavigate` closes the mobile Sheet
 *  when a link is tapped (a Link navigating doesn't close it on its own). */
function SidebarBody({
  pendingSubmissions = 0,
  appName = "Awards",
  logoUrl = null,
  isAdmin = false,
  modules,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { pending } = useOffline();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const canSee = (module: ModuleName | null) => !module || isAdmin || (modules?.[module]?.read ?? false);
  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item.module)),
  })).filter((group) => group.items.length > 0);
  const footerNav = FOOTER_NAV.filter((item) => (item.adminOnly ? isAdmin : canSee(item.module)));

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Trophy className="h-4 w-4" />
          </span>
        )}
        <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
          {appName}
        </span>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
        {navGroups.map((group) => (
          <div key={group.label ?? "top"}>
            {group.label && (
              <p className="mt-3 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-1">
                {group.label}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                  isActive(href)
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
                {href === "/distribution" && pending > 0 && (
                  <Badge variant="warning" className="ml-auto">
                    {pending}
                  </Badge>
                )}
                {href === "/submissions" && pendingSubmissions > 0 && (
                  <Badge variant="warning" className="ml-auto">
                    {pendingSubmissions}
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t px-2.5 py-2">
        {footerNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
              isActive(href)
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}

/** Desktop sidebar — a permanent column. Hidden below `md`; MobileSidebar
 *  covers that range instead (see app/(app)/layout.tsx). */
export function Sidebar({ className, ...props }: SidebarProps & { className?: string }) {
  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <SidebarBody {...props} />
    </aside>
  );
}

/** Mobile nav — a hamburger button that opens the same nav tree as a
 *  slide-in drawer. Closes itself on link tap and on route change (covers
 *  back/forward navigation and any programmatic redirect, neither of which
 *  fires a Link's onClick). */
export function MobileSidebar(props: SidebarProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open menu"
        className="shrink-0 md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </Button>
      <SheetContent
        side="left"
        className="flex flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SidebarBody {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
