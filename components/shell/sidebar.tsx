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
  School,
  ScrollText,
  Settings,
  Users,
  FileBarChart,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useOffline } from "@/components/offline/offline-sync-provider";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/submissions", label: "Submissions", icon: Inbox },
  { href: "/forms", label: "Forms", icon: FileEdit },
  { href: "/students", label: "Students", icon: Users },
  { href: "/academic-records/grades", label: "Grade Entry", icon: GraduationCap },
  { href: "/institutions", label: "Institutions", icon: School },
  { href: "/awards", label: "Awards", icon: Award },
  { href: "/gifts", label: "Gift Inventory", icon: Gift },
  { href: "/distribution", label: "Distribution", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: FileBarChart },
] as const;

const FOOTER_NAV = [
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({
  className,
  pendingSubmissions = 0,
}: {
  className?: string;
  pendingSubmissions?: number;
}) {
  const pathname = usePathname();
  const { pending } = useOffline();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Trophy className="h-4 w-4" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Awards</span>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
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
      </nav>

      <div className="space-y-0.5 border-t px-2.5 py-2">
        {FOOTER_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
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
    </aside>
  );
}
