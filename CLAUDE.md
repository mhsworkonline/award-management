# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm run dev         # dev server (http://localhost:3000)
npm run typecheck   # tsc --noEmit — use this to verify changes
npm run build       # production build
npm run lint        # next lint
npm run deploy      # typecheck, then commit + push to GitHub (node deploy.js)
node start.js        # dev server, auto-picks a free port if 3000 is busy
node start.js --prod # production server
```

**Never run `npm run build` (or `next start`) to verify a change while the user's own dev
server might be running.** Both a dev server and a build write into the same `.next` folder;
a production build overwrites the dev server's cache out from under it, and the browser then
gets served completely unstyled HTML (missing/mismatched CSS and JS chunks) until the dev
server is restarted. Use `npm run typecheck` for verification instead — it never touches
`.next` and catches almost everything a build would. Only run an actual build when there's a
specific reason typecheck can't cover (e.g. validating a Next.js file-convention route like
`opengraph-image.tsx`), and ask first rather than just doing it.

There is no test suite in this project.

`deploy.js` stages everything, runs the typecheck, commits with an auto-generated message (or
`node deploy.js "message"`), and pushes to the current branch's remote — no prompts.
`--skip-checks` skips the typecheck; `--no-push` commits locally only. Deployment is via
Vercel's GitHub integration (push to `main` → auto-deploy); there is no separate deploy step
beyond pushing.

## UI changes

**Every UI change must preserve or fix mobile responsiveness — check it at ~375px width, not
just desktop, before considering it done.** This app was made fully mobile-responsive in one
pass (see the mobile-nav and Dialog notes below) and a later "fix long text overflowing a
table column" change regressed it: switching a table to `table-fixed` without also giving it a
`min-w-[Npx]` forced all its columns to cram into a phone's actual width instead of letting
`TableWrap`'s `overflow-auto` scroll sideways (the pattern every other table in the app relies
on for mobile). A desktop-only fix that breaks mobile is not a finished fix. Reuse the
established patterns rather than re-deriving them:
- **Tables**: `table-fixed` (to stop content-driven column growth) needs a `min-w-[Npx]`
  alongside it, so the percentages stay meaningful and `TableWrap` (`overflow-auto`) scrolls
  horizontally below that width instead of crushing every column.
- **Modals/dialogs**: `Dialog`'s content is `w-[calc(100%-2rem)]`, not `w-full` — it's
  `position: fixed` against the viewport, so `w-full` would go edge-to-edge with no side gutter
  on a phone.
- **Forms**: `FieldGrid` defaults to a single column below `sm:` (`cols={1}` behavior even when
  `cols={2}` is passed) — never hardcode a multi-column grid without a mobile-width fallback.
- **Navigation**: mobile uses `MobileSidebar` (hamburger + `Sheet` drawer), not the desktop
  `<aside>` — see the Shell / mobile nav note below.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui (Radix primitives) · Supabase
(Postgres, Auth, Storage) · TanStack Query · react-hook-form + zod · exceljs ·
@react-pdf/renderer · idb (offline queue)

## Architecture

**Single organization, multi-tenant-ready.** Every table carries `org_id`, resolved from the
constant in `lib/constants.ts`. Going multi-tenant means resolving it from the session and
tightening RLS policies — no schema migration.

**Table prefix.** This Postgres schema is shared with other applications. Everything this app
owns — tables, enum types, functions, triggers, indexes — is prefixed `am_`. Physical names
live in one place, `lib/tables.ts` (the `T` map); the rest of the code uses logical names
(`T.students`), and embedded Supabase selects use PostgREST aliases
(`students:am_students(...)`) so response shapes stay unprefixed. Never hardcode an `am_*`
table name outside `lib/tables.ts`.

**Auth.** Supabase Auth. `middleware.ts` guards every route, but every server action and route
handler also calls `requireUser()` (or `requireAdmin()`) independently — nothing relies on the
middleware alone. Fine-grained module permissions (`lib/actions/roles.ts`, the
`am_roles`/`am_permissions` tables) gate what the UI shows (`usePermissions()`/`can(module,
action)` in `components/providers/permissions-provider.tsx`); RLS policies are the real
enforcement underneath that, not the UI check.

**Destructive actions need a server-side check, not just RLS.** RLS deletes zero rows *without an
error* when it blocks a delete, and Storage buckets have no per-module policy of their own. So
every delete action calls `requirePermission(module, "delete")` up front, uses `.select("id")` to
confirm a row was really removed (`NOTHING_DELETED` in `lib/actions/crud.ts`), and only then
touches Storage or the audit log. Migration 0037 also gates the three buckets' DELETE policies on
`am_has_permission`. Any new delete path must do the same, and its button must check
`can(module, "delete")`, not "update".

**Identity vs. per-year data — the core data model split.** `am_students` is a student's
*permanent identity* (name, contact) — one row per person, never duplicated across years.
Everything year-specific lives in `am_academic_records` (one row per student per academic
year: standard/course, percentage, grade, rank). Awards, gift allocations, and distribution
records all chain off `academic_record_id`, not off the student directly — so an award is
architecturally tied to one specific year, and a student's history across multiple years is
just multiple academic-record rows against the same student. `am_persons` mirrors `am_students`'
identity columns via a sync trigger (a placeholder for a future shared Community module — not
yet a real one-to-many relationship).

**Public application → review pipeline.** Students apply at `/apply` or `/apply/[slug]`
(outside the `(app)` route group — no auth, no sidebar). `resolveApplicationForm()` resolves
which `am_application_forms` row to render: no slug means "whichever form is enabled for the
org's current active academic year" — so the same public link keeps working every year without
being reshared, as long as a new form gets created (or an existing one repointed) each cycle.
Submissions land in `am_public_submissions` (status: `pending` / `approved` / `rejected` /
`doubtful`) and are reviewed in `/submissions`. Every decision (`lib/actions/submissions.ts`)
requires a note and stamps `reviewed_by`/`reviewed_at`/`review_note`; a full history of
decisions and edits is written to the general audit log (`am_audit_logs`, entity
`public_submissions`) and rendered in the review sheet — there's no separate history table.
**Approving is the only transition that creates data** (a new `am_students` row, find-or-create
by normalized name match, plus an `am_academic_records` row) and is reachable from any other
status; there is deliberately no path back out of `approved` through this flow — editing an
already-approved submission instead pushes the correction into the linked student/academic
record to keep them in sync, rather than letting the two drift apart. **Reviewing needs only
Submissions: Update** — approving, the duplicate-student check, and the roster sync on edit all
run through the service-role client (`createAdminClient`) after `requirePermission("submissions",
"update")`, so a Checker-style role doesn't need Students/Academic Records: Create (which would
also let it add students by hand). This means approval depends on `SUPABASE_SERVICE_ROLE_KEY`
being set wherever the app runs.

**Gift stock integrity.** `allocate_gift()` is a Postgres function holding a row lock while it
checks stock, inserts the allocation, and decrements inventory — two staff members can't
oversubscribe the same item. A delete trigger returns stock automatically.

**Offline scope.** Deliberately narrow: only the distribution check-off flow (`/distribution`).
Check-offs queue in IndexedDB keyed by `distribution_id` with a client-generated `local_uuid`;
`POST /api/distribution/sync` upserts by that `local_uuid`, so replaying a batch after a lost
response neither double-applies nor strands the queue. Sync fires on the `online` event, a 60s
sweep, and on demand from the topbar. Nothing else in the app works offline.

**Duplicate detection.** A warning, never a block — namesakes are real. Matches on normalized
`(institution, academic year, name)`, treating a differing father's/middle name as a distinct
person. Runs on both the manual entry form (debounced, live) and the Excel import (against the
database and within the file itself).

**Filters live in the URL.** Every list view reads `searchParams` server-side via
`hooks/use-query-params.ts`, so views are shareable and back-button correct, and PDF/Excel
exports reuse exactly the same query as the table on screen. `setParams({ key: "all" })`
deletes that param by default (since an absent param already means "show everything" on most
pages) — a page whose absent-param default is something narrower (Submissions defaults to
`pending`, not `all`) needs `{ keepAllValue: true }` so `"all"` survives as an explicit value
instead of collapsing back to that narrower default.

**Shell / mobile nav.** `components/shell/sidebar.tsx` exports one shared `SidebarBody` (the
branding header + nav tree) used by both the permanent desktop `<aside>` (`Sidebar`, hidden
below `md`) and `MobileSidebar` (a hamburger-triggered `Sheet` drawer for everything below
`md`) — the nav tree itself is never duplicated between the two.

**Link-preview metadata.** `/apply` and `/apply/[slug]` have `opengraph-image.tsx` routes
(dynamic, rendered via `next/og`, sourced from Settings → Branding's logo) so pasting the link
into WhatsApp/iMessage shows a proper thumbnail. `metadataBase` (root layout) resolves off
Vercel's own env vars (`VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`) with no manual
configuration needed unless a custom domain gets attached later (`NEXT_PUBLIC_SITE_URL`).

## Routes

| Route | Purpose |
|---|---|
| `/dashboard` | Counts, distribution progress, recent activity |
| `/submissions` | Review public applications — approve/reject/mark doubtful, edit at any status |
| `/forms` | Manage public application forms (one per academic year, shareable link/QR) |
| `/students` | Search/filter table, slide-over entry form, duplicate warnings |
| `/students/import` | Excel upload → validate → duplicate-flag → confirm |
| `/institutions` | Schools and colleges |
| `/academic-records/grades` | Per-year placement and grade entry |
| `/awards` | Assign award categories, allocate gifts against inventory |
| `/gifts` | Gift inventory and stock |
| `/distribution` | Check-off, offline-capable |
| `/reports` | Filtered preview, PDF and Excel generation |
| `/audit` | Read-only audit log |
| `/settings` | Branding, academic years, boards, mediums, standards, streams, courses, award categories, links/QR, backup, users & roles |
| `/apply`, `/apply/[slug]` | Public application form — outside the authenticated layout, never touch without being told to |

## Keyboard

`/` or `Ctrl/Cmd+K` focus search · `n` new student (on `/students`) · `Ctrl/Cmd+Enter` submit a
slide-over form
