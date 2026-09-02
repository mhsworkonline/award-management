# Vojaingg Platform — Master Plan & Discussion Log

Living document. Pick up any future conversation from here instead of re-deriving context.
Status as of **2026-08-25**: planning stage, no code written yet, no repo restructuring done yet.

## ⏸ ON HOLD as of 2026-09-02

Decision: **pause this entire plan and focus exclusively on award-management** (this repo, as
it stands today — not yet moved into any monorepo) until it's working great on its own. Resume
Phase 1 (backend consolidation) only after that. Nothing above has changed or been invalidated —
this is a sequencing decision, not a scope change. No action needed to "resume" beyond picking
this file back up.

---

## 1. Background

- **vojaingg.org** is the live website of *Shree Visa Oswal Jain Gurjar Gnati*, a Jain community
  society in Bhuj, Gujarat, active since 1931.
- The live site is old, hand-rolled PHP with a visible unhandled error
  (`Use of undefined constant SQL_STATEMENTS_LOG`), table-based early-2000s layout, image nav,
  no login/portal of any kind. Nav: Home, Committee Members, Mahila Mandal, Yuvak Mandal, Contact.
  Content: org history, education loans, dialysis center, health club, cultural programs.
- Decision: rebuild the whole platform from scratch. Content is treated as stale too, not just
  the code — nothing from the old site is assumed reusable without review.
- **Domain access**: the user does **not** currently control vojaingg.org — it's controlled by
  someone else (old webmaster or a committee member). Recovering access is the user's open
  action item, tracked as a parallel, non-blocking task (see §6).

## 2. Existing assets discovered mid-planning

Before proposing anything from scratch, the workspace was searched and three relevant projects
were found already in progress:

| Project | Location | What it is |
|---|---|---|
| **award-management** | `c:/claude-folder/award-management` (this repo) | Production-shaped Next.js + Supabase app for merit awards: students, institutions, gift inventory, distribution, reports. Single hardcoded admin login. Currently lives in a shared Supabase project `my-common` (ref `jplobtwvjxfwlfmfsyku`), tables prefixed `am_`. Has a real GitHub remote (`mhsworkonline/award-management`). |
| **community-tree** | `c:/claude-folder/community-tree/apps/web` | A separately-scaffolded Next.js + Supabase app: signup/login, admin-approval "pending" flow, family tree (`parent_id` self-referencing hierarchy, reactflow visualization), member directory, profiles, admin panel. ~3,200 lines of real component code, not a stub. Own dedicated Supabase project (ref `wgexlatfcoemskzskjsp`). Git history is local-only (3 commits, no remote) — confirmed **recent** (last commit 2026-08-13) and **substantial**, not old/throwaway as initially assumed. |
| **vojaingg-website-1 / -2** | `c:/claude-folder/vojaingg-website-1`, `-2` | Static HTML mockups/shell from an earlier design exploration (5 page mockups + a Tailwind CDN shell). Confirmed by the user to be throwaway test work — **dropped entirely**, not migrated. |

`community-tree` is confirmed to be the right base for the **Community module** — its
family-tree/directory/admin-approval shape is what "Community" means here, not something broader.

## 3. Decisions log (chronological)

1. **Everything becomes one project family**, not three disconnected apps: a public main site
   plus an Awards module and a Community module, more modules to follow over time.
2. **Single repo, monorepo layout** — not three separate folders — because more modules are
   expected and shared code/tooling should live in one place. Repo (and local folder) will be
   **renamed from `award-management` to `vojaingg`**.
3. **vojaingg-website-1/-2 dropped.** The main site (`apps/web`) is built from scratch: same
   stack as the other apps (Next.js + Tailwind + shadcn/ui) for design/tooling consistency.
4. **Content approach for apps/web**: content/IA pass first, then design tokens, then pages.
   Placeholder copy for now (user will supply real content later). Living content (committee
   roster, events, activities) will be Supabase-backed with a small admin screen so
   non-technical committee members can update it later — not hardcoded/MDX-only.
5. **Auth model pivoted from "3 separate logins" to single unified login.** One identity across
   every module; the (single) super-admin decides, per user, which modules they can access and
   what role they hold in each. Logging in once does **not** imply access to everything —
   access per module is an explicit grant.
6. **Super-admin**: just the user (no multi-admin permission system needed for now).
7. **Backend consolidation**: rather than a brand-new third Supabase project, **reuse
   community-tree's existing project**, renamed (display name only) to `vojaingg`. This was
   independently confirmed necessary, not just preferred — **the Supabase free tier caps out at
   2 projects, and both are already in use** (`my-common` + community-tree's project). There is
   no room for a third project, so this is the only viable path, and also the simplest.
8. **`my-common` stays untouched** for the user's other, unrelated apps (bug-tracker `BT_`,
   posh-marketing `aiw_`/`aik_`/`pp_`, utility-app `ua_`) — those have nothing to do with
   vojaingg and there's nowhere else for them to move to anyway.
9. **Only award-management's `am_` tables migrate out of `my-common`** into the renamed
   `vojaingg` project — not the unrelated apps' tables. (Stated as an assumption pending final
   explicit confirmation from the user — see §6.)
10. **Flat `vo_` prefix for every table** in the consolidated project (not per-module prefixes
    like `vo_am_`/`vo_cm_`). Minor collision risk between modules noted (e.g. both might want a
    table called "settings") but the user's explicit instruction stands; handle collisions by
    renaming individual tables as they come up, not by adding sub-prefixes preemptively.
11. **"Keep it simple and scalable, no complicated dependencies"** — explicitly trimmed from
    earlier drafts: no Turborepo (plain npm/pnpm workspaces only, add Turborepo later only if
    build times actually hurt), no `packages/config`, no separate `apps/admin` (the access-grant
    screen is just a protected route inside `apps/web`), no `modules` registry table (a check
    constraint on a text column instead), `packages/ui` starts as design tokens only, not a
    component library, until real duplication justifies it.
12. **No staging/dev Supabase project.** With the 2-project cap fully spent, there's no free
    slot for a disposable sandbox. Future schema/RLS changes happen carefully against the one
    production project (or via Supabase branching, which needs a paid plan). Flagged, not
    solved — revisit if/when it becomes painful.

## 4. Locked architecture

### Repo layout
```
vojaingg/
├── apps/
│   ├── web/          ← main site (vojaingg.org), built from scratch, includes the
│   │                     access-grant admin route
│   ├── awards/        ← award-management, moved in with git history preserved
│   └── community/     ← community-tree, moved in fresh (local-only history, low value,
│                          default: drop it rather than graft it in)
├── packages/
│   └── ui/            ← shared design tokens only (colors, spacing, type scale)
```
Plain npm/pnpm workspaces, no Turborepo. Each app still deploys as its own Vercel project.

### Backend (single Supabase project, renamed `vojaingg`, reusing community-tree's project ref)
```
auth.users              ← Supabase Auth, one identity per person, shared across all apps
vo_profiles              ← id, name, email (renamed from community-tree's current `profiles`)
vo_user_module_roles      ← (user_id, module, role)
                              module: 'awards' | 'community' | ...  (plain check constraint)
                              role:   text, meaning defined per module
                                      (awards: 'admin'|'viewer'; community: 'admin'|'member')
-- plus every award-management table renamed am_* → vo_* (vo_students, vo_institutions,
-- vo_awards, vo_gifts, vo_distribution, vo_audit_log, vo_settings, etc.)
```
No `modules` registry table. RLS policies get rewritten to check `vo_user_module_roles` instead
of each app's current standalone admin check.

### Auth mechanics
Supabase Auth session cookie scoped to `.vojaingg.org` (real cross-subdomain SSO, no external
identity provider, no custom auth server). Each app's middleware: (1) is there a session?
(2) does `vo_user_module_roles` have a row for *this* module for this user? No row → no entry,
even if logged in elsewhere.

### Deployment target
`vojaingg.org` (main), `awards.vojaingg.org`, `community.vojaingg.org` — built now against
temporary Vercel default domains; DNS cutover happens once the user recovers control of the
domain (§6).

## 5. Phased plan

1. **Backend consolidation** (do this before moving code, so code only gets rewired once):
   - Rename community-tree's Supabase project (display name) → `vojaingg`.
   - Recreate award-management's schema there under `vo_` prefix; rename community-tree's
     `profiles` → `vo_profiles`; add `vo_user_module_roles`.
   - Rewrite RLS policies against the shared roles table.
   - Migrate award-management's actual data from `my-common`'s `am_` tables into the new
     `vo_` tables; verify row counts/relationships.
   - Repoint award-management's env vars + `lib/tables.ts` to the new project/prefix.
   - Verify fully working, keep old `am_` tables in `my-common` briefly as rollback safety net,
     then drop them. `my-common` itself and its other apps are otherwise untouched.
2. **Monorepo restructuring** — rename repo/folder `award-management` → `vojaingg`, create the
   `apps/`/`packages/ui` layout, move award-management → `apps/awards` (git history preserved
   via `git mv`-based restructuring in place), move community-tree → `apps/community`.
3. **apps/web from scratch** — content/IA pass (placeholder copy) → design tokens →
   pages → the access-grant admin route.
4. **Public-output integration** — read-only views so `apps/web` can show award winners /
   community directory previews without requiring login.
5. **Domain cutover** — once DNS access is recovered: point subdomains, verify real
   cross-subdomain SSO.

## 6. Open items / pending user action

- **Confirm migration scope**: assumed only award-management's `am_` tables move out of
  `my-common` (not bug-tracker/posh-marketing/utility-app's tables). Stated but not yet
  explicitly reconfirmed by the user after the "2-project cap" clarification — treat as locked
  unless corrected.
- **Recover vojaingg.org domain access** — someone else currently controls it (old webmaster or
  a committee member). This is on the user to chase down; not a build blocker, but gates final
  go-live and real cross-subdomain SSO testing.
- **community-tree's 3 local git commits**: default is to drop them when moving into the
  monorepo (local-only, no remote, low value) — flagged once, not yet explicitly reconfirmed.

## 7. Next step

Ready to start **Phase 1 (backend consolidation)** on go-ahead. Still no code has been written —
this file is the planning record to resume from.
