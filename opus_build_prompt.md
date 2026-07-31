# ROLE
You are the sole engineer building this application end-to-end, autonomously, in one continuous session.

# OPERATING RULES (binding, apply to every message you output)
1. No prose, no explanations, no preamble. Output only file paths + file contents (code blocks) or commands.
2. No test files, no test frameworks, no test scaffolding unless the user's next message explicitly contains `--include-tests`.
3. This is Windows. Never output bash. All shell commands must be PowerShell (`New-Item`, `Set-Location`, etc.), never `mkdir -p`, `touch`, `&&` chains, or POSIX syntax.
4. Work autonomously. Treat everything below as settled prior context (equivalent to a CLAUDE.md already agreed with the user). Do not ask clarifying questions — if something is unspecified, make the most mainstream, boring choice consistent with the stack below and proceed.
5. Token efficiency: minimal redundancy, no restating this brief back, no summarizing what you're about to do. Structured output only — file contents as code blocks with a path header, or JSON where relevant.
6. Deliver final results only. Do not show draft versions, intermediate reasoning, or "let me first..." narration. One pass per file, correct the first time.
7. Build the entire application in one continuous pass — every module below, fully wired end to end. Do not stage, phase, or checkpoint the work and do not stop to report progress partway through. Decide build order, file structure, and sequencing yourself; the module list below is scope, not a sequence. Output the complete file set only when the full application is done.

# PROJECT BRIEF
Problem: A single organization running annual merit-award ceremonies across its affiliated schools & colleges needs a fast, reliable system to manage student records, award categories, and gift inventory, and to track physical prize distribution — including at ceremony venues with unreliable internet — replacing ad hoc spreadsheets.

Users: The organization's own admin staff (small team, single role at launch). Mostly office-based data entry; same staff also use a venue-day distribution check-off flow on phone/tablet with poor connectivity.

Scale: Small — under 5,000 students/year, low concurrency (single-digit simultaneous users).

Core flows:
1. Configure (Settings, no code changes): academic years, institutions (schools/colleges), boards, mediums, courses/degrees, standards/semesters, award categories, gift inventory items.
2. Add students: bulk Excel import per institution/year, or fast manual entry; duplicate detection on both paths.
3. Search/browse students with advanced filters (institution, year, category, board, medium, standard/course).
4. Allocate gifts to winning students per award category.
5. Track physical distribution — including offline check-off that queues locally and syncs when connectivity returns.
6. Generate PDF distribution lists/reports (per institution/category) and export data to Excel.
7. Dashboard summaries, filtered reports; every write captured in an audit log.

In scope: single-org data model but tenant-ready (org_id on every table, no multi-tenant UI/billing built); institution management with configurable boards/mediums/courses/standards; academic year management; student CRUD + bulk Excel import/export + duplicate detection; award categories, gift inventory, gift allocation, distribution tracking; offline-capable check-off scoped ONLY to the distribution-tracking flow; PDF generation for lists/reports (not certificates); dashboard + filtered reports; audit log; Asana-inspired UI (shadcn/ui + Tailwind, light/dark, slide-over panels, sticky table headers, keyboard-friendly).

Out of scope: multi-tenant sign-up/billing/org-switching UI; RBAC/multiple roles (single admin only); individual student certificates; full offline-first app (offline is ONLY the distribution check-off flow); payments; public/parent portal.

# ARCHITECTURE

## Stack
| Layer | Choice |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| UI | Tailwind CSS + shadcn/ui, Asana-inspired: left sidebar nav, top search bar, slide-over sheets for detail/edit, sticky table headers, soft shadows, rounded-lg corners, no flashy animation |
| Data fetching/cache | TanStack Query |
| Forms/validation | react-hook-form + zod |
| Backend | Next.js Route Handlers / Server Actions (no separate backend service) |
| Database | Supabase Postgres |
| Auth | Supabase Auth, single admin role, email/password |
| File storage | Supabase Storage (generated PDFs, uploaded Excel files) |
| PDF generation | `@react-pdf/renderer` (server-side route handler) |
| Excel import/export | `exceljs` |
| Offline queue (distribution check-off ONLY) | IndexedDB via `idb`, custom sync-on-reconnect logic, no service worker framework beyond a minimal background sync listener |
| Deployment | Vercel |
| Env/secrets | Vercel/`.env.local` environment variables |

## Domain model
- **Organization**: id, name (single row now; org_id FK present on all tables below for future multi-tenant readiness)
- **AcademicYear**: id, org_id, label (e.g. "2026-27"), start_date, end_date, is_active
- **Board**: id, org_id, name (CBSE, State Board, ...), applies_to (school|college)
- **Medium**: id, org_id, name (English, Gujarati, ...)
- **Course**: id, org_id, name (BE, MBBS, BCom, Diploma, ...), structure_type (year|semester), total_periods (int)
- **Standard**: id, org_id, level (1-12), applies_to = school
- **Institution**: id, org_id, name, type (school|college), board_id (nullable, school only), medium_id (nullable, school only)
- **Student**: id, org_id, institution_id, academic_year_id, name, father_name, standard_id (nullable), course_id (nullable), period_no (nullable, for course year/sem), roll_no, contact_no, created_at
- **AwardCategory**: id, org_id, name (No. 1, No. 2, No. 3, Consolation), sort_order
- **StudentAward**: id, org_id, student_id, academic_year_id, award_category_id, subject_or_criteria
- **GiftItem**: id, org_id, name, sku, unit_cost, quantity_on_hand
- **GiftAllocation**: id, org_id, student_award_id, gift_item_id, quantity
- **DistributionRecord**: id, org_id, gift_allocation_id, status (pending|distributed), distributed_at, distributed_by, sync_status (synced|queued_offline), local_uuid (client-generated, for offline dedupe)
- **AuditLog**: id, org_id, entity_name, entity_id, action (create|update|delete), actor, diff_json, created_at

Invariants:
- GiftAllocation.quantity sum per GiftItem ≤ GiftItem.quantity_on_hand
- DistributionRecord requires an existing GiftAllocation
- Duplicate detection: flag Student as probable duplicate when (institution_id, academic_year_id, normalized name, father_name) fuzzy-matches an existing row — surface as a warning, not a hard block

State machine — DistributionRecord: `pending → distributed` (client sets `distributed` locally while offline with `sync_status=queued_offline`; on reconnect, upsert by `local_uuid` sets `sync_status=synced`).

## System design (components, one-line responsibility each)
- `settings` module — CRUD for Board/Medium/Course/Standard/AcademicYear/AwardCategory/GiftItem
- `institutions` module — CRUD + list/search for schools & colleges
- `students` module — manual entry form, search/filter table, Excel import wizard with duplicate-warning step, Excel export
- `awards` module — assign StudentAward + GiftAllocation against inventory
- `distribution` module — online check-off UI + IndexedDB-backed offline check-off UI + sync reconciliation on reconnect
- `reports` module — filtered report views, PDF generation trigger, Excel export trigger
- `dashboard` module — summary counts/widgets (students entered, awards allocated, gifts distributed, pending sync)
- `audit` module — read-only audit log viewer with filters
- `auth` — Supabase Auth login page + session middleware guarding all routes

Flow traces:
1. Settings config → written directly to Postgres tables, read by dropdowns everywhere else via TanStack Query cache
2. Student add (manual or Excel) → duplicate-check query → insert → audit log row
3. Search/filter → server-side filtered query with pagination → sticky-header table
4. Gift allocation → check GiftItem.quantity_on_hand → insert GiftAllocation → decrement stock → audit log
5. Distribution online → update DistributionRecord.status directly
5b. Distribution offline → write to IndexedDB queue with local_uuid → on reconnect, batch upsert to Supabase keyed by local_uuid → mark synced
6. Report/PDF/Excel → same filtered query as Students search → renderer (react-pdf or exceljs) → Supabase Storage → signed URL download
7. Every module's create/update/delete → audit module writes AuditLog row (server-side, non-bypassable)

External dependency: Supabase — if down, app shows a banner and blocks writes (except the offline distribution queue, which keeps working locally and syncs later).

## Cross-cutting
- Auth: Supabase Auth session cookie via middleware; all Route Handlers verify session server-side
- Errors: toast (shadcn `sonner`) for user-facing; server errors logged to a `error_log` table with stack + route
- Config/secrets: Supabase URL/anon key/service key in Vercel env vars, never client-exposed beyond anon key

## Hardest to change later (commit now)
- org_id on every table (multi-tenant readiness) — near-zero cost now, expensive retrofit later
- DistributionRecord's local_uuid + sync_status shape — the offline sync contract; changing it later means a data migration across every already-synced record

# SCOPE — DELIVER ALL OF THIS IN ONE SHOT

- Project scaffold: Next.js + TypeScript + Tailwind + shadcn/ui, Supabase schema as SQL migration (all tables above), Supabase Auth login + session middleware, sidebar-nav app shell.
- Settings + Institutions: full CRUD (slide-over forms) for Board, Medium, Course, Standard, AcademicYear, AwardCategory, GiftItem, Institution.
- Students: manual entry form, search/filter table with pagination + sticky header, duplicate-detection warning on save.
- Excel import/export: upload wizard (parse → validate → duplicate-flag → confirm → bulk insert), export current filtered view to Excel.
- Awards + gift allocation: assign StudentAward, allocate GiftItem against StudentAward with stock-quantity enforcement.
- Distribution tracking: online mark-distributed flow, audit log wired across every module above.
- Offline check-off: IndexedDB queue (`idb`), local_uuid generation, connectivity detection, sync reconciliation UI.
- Reports + PDF/Excel export + Dashboard: filtered report views, PDF generation via react-pdf, dashboard summary widgets.
- Polish: dark mode toggle, keyboard shortcuts (search focus, new-record shortcut), consistent slide-over/empty/loading states across all modules.

You decide internal build order and file structure to get there fastest and most correctly — the list above is the required scope, not a sequence to narrate.

# START
Build the complete application now, end to end, in a single pass. Output only files and commands, per the Operating Rules above.
