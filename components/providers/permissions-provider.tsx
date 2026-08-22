"use client";

import * as React from "react";
import type { ModuleName, ModulePermissions, CrudAction } from "@/lib/types";

type PermissionsContextValue = {
  isAdmin: boolean;
  modules: Record<ModuleName, ModulePermissions>;
  /** UX only — RLS on the underlying table is the real enforcement either
   *  way (see 0022_roles_and_permissions.sql). This just decides what a
   *  button/page shows, so a stale value here can never expose data. */
  can: (module: ModuleName, action: CrudAction) => boolean;
};

const PermissionsContext = React.createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({
  isAdmin,
  modules,
  children,
}: {
  isAdmin: boolean;
  modules: Record<ModuleName, ModulePermissions>;
  children: React.ReactNode;
}) {
  const value = React.useMemo<PermissionsContextValue>(
    () => ({
      isAdmin,
      modules,
      can: (module, action) => isAdmin || Boolean(modules[module]?.[action]),
    }),
    [isAdmin, modules],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/** Read the signed-in user's module permissions from anywhere in the app
 *  shell — seeded once in (app)/layout.tsx alongside the sidebar's own read
 *  of the same map, so this never triggers an extra fetch. */
export function usePermissions() {
  const ctx = React.useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions() must be used inside PermissionsProvider");
  return ctx;
}
