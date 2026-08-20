# Award Management

Annual student merit awards and prize distribution for schools and colleges.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Storage) · TanStack Query · react-hook-form + zod · exceljs · @react-pdf/renderer · idb

## Setup

Already provisioned against Supabase project `jplobtwvjxfwlfmfsyku` (`my-common`):
schema applied, seed data loaded, admin user created, `.env.local` written.

```powershell
npm install
npm run dev   # http://localhost:3000
```

**Login:** `admin@awardmanagement.com` / `99999999`

Supabase Auth identifies users by email, so the requested `admin` username is stored as
`admin@awardmanagement.com` (the `username` claim on the user record is `admin`). Sign in with
the full email.

To provision a fresh project instead, run `supabase/migrations/0001_init.sql` in the SQL
editor and create a user via Dashboard → Authentication → Users → Add user (Auto Confirm on).
Self-signup is intentionally disabled.

## Table prefix

This app shares its Postgres schema with other applications (`BT_`, `aiw_`, `aik_`, `pp_`,
`ua_` tables). Everything it owns is prefixed **`am_`** — tables, enum types, functions,
triggers and named indexes. Physical names live in one place, [lib/tables.ts](lib/tables.ts);
the rest of the code uses logical names (`T.students`), and embedded selects use PostgREST
aliases (`students:am_students(...)`) so response shapes stay unprefixed.

## Architecture notes

**Single organization, multi-tenant ready.** Every table carries `org_id`, resolved from
`lib/constants.ts`. Going multi-tenant means resolving it from the session and tightening the
RLS policies — no schema migration.

**Auth.** Supabase Auth, single admin role. `middleware.ts` guards every route; every server
action and route handler calls `requireUser()` independently, so nothing relies on the
middleware alone.

**Audit log.** Written server-side in `lib/audit.ts` from the action layer. Clients can insert
and read but never update or delete audit rows (enforced by RLS).

**Gift stock integrity.** `allocate_gift()` is a Postgres function holding a row lock while it
checks stock, inserts the allocation and decrements inventory — two operators cannot
oversubscribe the same item. A delete trigger returns stock automatically.

**Offline scope.** Deliberately narrow: only the distribution check-off flow (`/distribution`).
Check-offs go to an IndexedDB queue keyed by `distribution_id` with a client-generated
`local_uuid`; `POST /api/distribution/sync` upserts by that `local_uuid`, so replaying a batch
after a lost response neither double-applies nor strands the queue. Sync fires on the `online`
event, on a 60s sweep, and on demand from the topbar. Nothing else in the app works offline.

**Duplicate detection.** Warning, never a block — namesakes are real. Matches on normalized
`(institution, academic year, name)` and treats a differing father's name as a distinct person.
Runs on both the manual form (debounced, live) and the Excel import (against the database and
within the file itself).

**Filters live in the URL.** Every list view reads `searchParams` server-side, so views are
shareable and back-button correct, and PDF/Excel exports reuse exactly the same query as the
table on screen.

## Routes

| Route | Purpose |
|---|---|
| `/dashboard` | Counts, distribution progress, recent activity |
| `/students` | Search/filter table, slide-over entry form, duplicate warnings |
| `/students/import` | Excel upload → validate → duplicate-flag → confirm |
| `/institutions` | Schools and colleges |
| `/awards` | Assign award categories, allocate gifts against inventory |
| `/gifts` | Gift inventory and stock |
| `/distribution` | Check-off, offline-capable |
| `/reports` | Filtered preview, PDF and Excel generation |
| `/audit` | Read-only audit log |
| `/settings` | Academic years, boards, mediums, standards, courses, award categories |

## Keyboard

`/` or `Ctrl/Cmd+K` focus search · `n` new student (on `/students`) · `Ctrl/Cmd+Enter` submit a slide-over form

## Scripts

```powershell
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run deploy      # typecheck, then commit + push to GitHub (node deploy.js)
```

`deploy.js` stages everything, runs the typecheck, commits with an auto-generated message (or pass
one: `node deploy.js "message"`), and pushes to the current branch's remote — no prompts.
`--skip-checks` skips the typecheck; `--no-push` commits locally only.
