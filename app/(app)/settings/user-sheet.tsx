"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field } from "@/components/form/field";
import { createUser, updateUserRole } from "@/lib/actions/users";
import type { Role, UserRow } from "@/lib/types";

type Values = {
  email: string;
  password: string;
  full_name: string;
  role_id: string;
  is_admin: boolean;
};

const EMPTY: Values = { email: "", password: "", full_name: "", role_id: "", is_admin: false };

/** Generates a readable-enough random temp password — the admin hands it to
 *  the user out-of-band; there's no invite-email flow yet. */
function randomPassword() {
  return Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-6).toUpperCase() + "!1";
}

export function UserSheet({
  open,
  onOpenChange,
  user,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRow | null;
  roles: Role[];
}) {
  const router = useRouter();
  const isEdit = Boolean(user);
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setServerError(null);
    setValues(
      user
        ? { email: user.email ?? "", password: "", full_name: user.full_name ?? "", role_id: user.role_id ?? "", is_admin: user.is_admin }
        : { ...EMPTY, password: randomPassword() },
    );
  }, [open, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSubmitting(true);

    try {
      const result = isEdit
        ? await updateUserRole({ id: user!.id, role_id: values.role_id || null, is_admin: values.is_admin })
        : await createUser({
            email: values.email,
            password: values.password,
            full_name: values.full_name || null,
            role_id: values.role_id || null,
            is_admin: values.is_admin,
          });

      if (!result.ok) {
        setServerError(result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error);
        return;
      }

      toast.success(isEdit ? "User updated" : "User created", {
        description: !isEdit ? `Temp password: ${values.password} — share it with them directly.` : undefined,
        duration: !isEdit ? 15000 : undefined,
      });
      router.refresh();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit user" : "New user"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Change this user's role or admin status. Takes effect on their very next action."
                : "You'll set a temp password here and hand it to them directly — there's no email invite yet."}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoFocus={!isEdit}
                autoComplete="off"
                disabled={isEdit}
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              />
            </Field>

            {!isEdit && (
              <Field label="Temporary password" htmlFor="password" required hint="Share this with the user directly — they aren't emailed automatically.">
                <Input
                  id="password"
                  autoComplete="off"
                  value={values.password}
                  onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                />
              </Field>
            )}

            {!isEdit && (
              <Field label="Full name" htmlFor="full_name">
                <Input
                  id="full_name"
                  autoComplete="off"
                  value={values.full_name}
                  onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))}
                />
              </Field>
            )}

            <Field label="Role" hint="No role means no module access at all.">
              <Select
                value={values.role_id || "__none__"}
                onValueChange={(v) => setValues((s) => ({ ...s, role_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No role</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <label className="flex items-start gap-2.5 rounded-md border p-3">
              <Checkbox
                checked={values.is_admin}
                onCheckedChange={(c) => setValues((v) => ({ ...v, is_admin: c === true }))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13px] font-medium">Administrator</span>
                <span className="block text-[12px] text-muted-foreground">
                  Full access to every module, plus managing roles and users. Independent of the role
                  above — an admin's module access always overrides it.
                </span>
              </span>
            </label>

            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                {serverError}
              </p>
            )}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {isEdit ? "Save changes" : "Create user"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
