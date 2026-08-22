-- Award Management — roles & permissions
--
-- Replaces "any authenticated user has full access" with real RBAC:
--   am_roles       — admin-created, e.g. "Administrator", "Data Entry Staff"
--   am_permissions — one row per (role, module): can_create/read/update/delete
--   am_profiles    — one row per auth.users row: which role, plus a separate
--                    is_admin flag that governs Users & Roles management itself
--                    (kept OUT of the module grid — see rationale below)
--
-- Module list is fixed in code (am_module enum), not admin-editable — a new
-- module means a code change, matching how the sidebar's NAV list works today.
--
-- Reports and Dashboard have no dedicated table, so they are not part of the
-- RLS rewrite below — Reports gets an am_permissions row and is gated at the
-- page level (see lib/supabase/server.ts requirePermission); the data it
-- displays is still governed by the real per-table RLS on whatever it reads.
-- Dashboard has no permission row at all — visible to anyone signed in.
--
-- Why is_admin is separate from the module grid: if "manage Users & Roles"
-- were just another module row, a role with Update on it could grant itself
-- more access — permissions governing permissions. is_admin is a plain
-- boolean nobody can grant themselves through the grid.

-- ---------------------------------------------------------------- module enum
create type am_module as enum (
  'students', 'academic_records', 'institutions', 'awards', 'gifts',
  'distribution', 'submissions', 'forms', 'reports', 'settings'
);

-- ---------------------------------------------------------------- tables
create table am_roles (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references am_organizations(id) on delete cascade,
  name         text not null,
  is_protected boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, name)
);

create table am_permissions (
  role_id    uuid not null references am_roles(id) on delete cascade,
  module     am_module not null,
  can_create boolean not null default false,
  can_read   boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  primary key (role_id, module)
);

-- Profile row per Supabase Auth user. role_id is nullable (no role = no module
-- access at all) and ON DELETE RESTRICT so a role in use can't be deleted out
-- from under its users — the admin must reassign them first.
create table am_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references am_organizations(id) on delete cascade,
  role_id    uuid references am_roles(id) on delete restrict,
  is_admin   boolean not null default false,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index am_profiles_role_idx on am_profiles (role_id);

create trigger am_roles_touch before update on am_roles
for each row execute function am_tg_touch_updated_at();

create trigger am_profiles_touch before update on am_profiles
for each row execute function am_tg_touch_updated_at();

-- ---------------------------------------------------------------- permission-check functions
-- SECURITY DEFINER + owned by the migration role, so these bypass RLS on
-- am_profiles/am_permissions internally — the standard way to avoid a policy
-- on am_profiles needing to query am_profiles to decide whether it can query
-- am_profiles (infinite recursion otherwise).
create or replace function am_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from am_profiles where id = auth.uid()), false);
$$;

create or replace function am_has_permission(p_module am_module, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    coalesce((select is_admin from am_profiles where id = auth.uid()), false)
    or coalesce((
      select case p_action
        when 'create' then perm.can_create
        when 'read'   then perm.can_read
        when 'update' then perm.can_update
        when 'delete' then perm.can_delete
        else false
      end
      from am_profiles prof
      join am_permissions perm on perm.role_id = prof.role_id and perm.module = p_module
      where prof.id = auth.uid()
    ), false);
$$;

revoke all on function am_is_admin() from public;
revoke all on function am_has_permission(am_module, text) from public;
grant execute on function am_is_admin() to authenticated;
grant execute on function am_has_permission(am_module, text) to authenticated;

-- ---------------------------------------------------------------- RLS on the new tables themselves
-- Role/permission names need to be readable by everyone (populating dropdowns,
-- showing "you are: Data Entry Staff" in the UI) — only writes are admin-gated.
alter table am_roles enable row level security;
create policy am_roles_select on am_roles for select to authenticated using (true);
create policy am_roles_insert on am_roles for insert to authenticated with check (am_is_admin());
create policy am_roles_update on am_roles for update to authenticated using (am_is_admin()) with check (am_is_admin());
create policy am_roles_delete on am_roles for delete to authenticated using (am_is_admin());

alter table am_permissions enable row level security;
create policy am_permissions_select on am_permissions for select to authenticated using (true);
create policy am_permissions_insert on am_permissions for insert to authenticated with check (am_is_admin());
create policy am_permissions_update on am_permissions for update to authenticated using (am_is_admin()) with check (am_is_admin());
create policy am_permissions_delete on am_permissions for delete to authenticated using (am_is_admin());

-- Profiles: a user can read their own row (needed to know their own role/
-- admin status); only an admin can read everyone else's, or write any row.
-- No self-service update yet (e.g. editing your own display name) — keeping
-- every write admin-gated for now is the safer default; can be relaxed later.
alter table am_profiles enable row level security;
create policy am_profiles_select on am_profiles for select to authenticated using (id = auth.uid() or am_is_admin());
create policy am_profiles_insert on am_profiles for insert to authenticated with check (am_is_admin());
create policy am_profiles_update on am_profiles for update to authenticated using (am_is_admin()) with check (am_is_admin());
create policy am_profiles_delete on am_profiles for delete to authenticated using (am_is_admin());

-- ---------------------------------------------------------------- seed: Administrator + backfill
-- Every existing auth.users row is assigned Administrator so nobody loses
-- access the moment the RLS rewrite below goes live.
do $$
declare
  v_admin_role_id uuid;
begin
  insert into am_roles (org_id, name, is_protected)
  values ('00000000-0000-0000-0000-000000000001', 'Administrator', true)
  returning id into v_admin_role_id;

  insert into am_permissions (role_id, module, can_create, can_read, can_update, can_delete)
  select v_admin_role_id, m, true, true, true, true
  from unnest(enum_range(null::am_module)) as m;

  insert into am_profiles (id, org_id, role_id, is_admin)
  select u.id, '00000000-0000-0000-0000-000000000001', v_admin_role_id, true
  from auth.users u
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------- protect the Administrator role
-- Created after the seed above so the seed's own inserts aren't blocked by it
-- (triggers fire regardless of RLS/role — unlike RLS, they are not bypassed
-- for the migration-applying role).
create or replace function am_tg_protect_role() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    if old.is_protected then
      raise exception 'The "%" role is protected and cannot be deleted', old.name;
    end if;
    return old;
  end if;
  if old.is_protected and new.is_protected is distinct from true then
    raise exception 'The "%" role cannot lose its protected status', old.name;
  end if;
  return new;
end $$;

create trigger am_roles_protect
before update or delete on am_roles
for each row execute function am_tg_protect_role();

create or replace function am_tg_protect_role_permissions() returns trigger
language plpgsql as $$
declare
  v_protected boolean;
begin
  select is_protected into v_protected from am_roles where id = coalesce(new.role_id, old.role_id);
  if v_protected then
    raise exception 'Permissions for a protected role cannot be changed';
  end if;
  return coalesce(new, old);
end $$;

create trigger am_permissions_protect
before insert or update or delete on am_permissions
for each row execute function am_tg_protect_role_permissions();

-- ---------------------------------------------------------------- RLS rewrite: the 10 modules
-- Drops each table's old "_authenticated_all" policy and replaces it with
-- four permission-checked policies. Each table maps to exactly one module,
-- but a module can own several tables — e.g. "awards" (the Awards page) owns
-- both am_student_awards and am_gift_allocations, since that page both
-- records the award and allocates its gift in one flow. The grouping follows
-- the sidebar's pages, not the physical schema.
--
-- One coupling worth knowing: adding a new student also inserts its first
-- am_academic_records row in the same action, and approving a submission
-- inserts into am_students + am_academic_records too — so a role needs
-- Create on both Students and Academic Records/Grades for those flows to
-- fully succeed, not just Create on the one that seems relevant.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('am_students',              'students'),
      ('am_academic_records',      'academic_records'),
      ('am_institutions',          'institutions'),
      ('am_student_awards',        'awards'),
      ('am_gift_allocations',      'awards'),
      ('am_gift_items',            'gifts'),
      ('am_distribution_records',  'distribution'),
      ('am_public_submissions',    'submissions'),
      ('am_submission_attachments','submissions'),
      ('am_application_forms',     'forms'),
      ('am_academic_years',        'settings'),
      ('am_boards',                'settings'),
      ('am_mediums',                'settings'),
      ('am_courses',               'settings'),
      ('am_standards',             'settings'),
      ('am_award_categories',      'settings'),
      ('am_organizations',         'settings')
    ) as t(tbl, module)
  loop
    execute format('drop policy if exists %I on %I', r.tbl || '_authenticated_all', r.tbl);
    execute format(
      'create policy %I on %I for select to authenticated using (am_has_permission(%L::am_module, ''read''))',
      r.tbl || '_select', r.tbl, r.module
    );
    execute format(
      'create policy %I on %I for insert to authenticated with check (am_has_permission(%L::am_module, ''create''))',
      r.tbl || '_insert', r.tbl, r.module
    );
    execute format(
      'create policy %I on %I for update to authenticated using (am_has_permission(%L::am_module, ''update'')) with check (am_has_permission(%L::am_module, ''update''))',
      r.tbl || '_update', r.tbl, r.module, r.module
    );
    execute format(
      'create policy %I on %I for delete to authenticated using (am_has_permission(%L::am_module, ''delete''))',
      r.tbl || '_delete', r.tbl, r.module
    );
  end loop;
end $$;

-- ---------------------------------------------------------------- audit/error logs: admin-only read
-- These are trust-sensitive history, not a business module — nobody edits or
-- deletes them (no policy for those = denied by default), and now only an
-- admin can read them. Insert stays open to any authenticated user since
-- every tracked action writes its own audit row as the acting user.
drop policy am_audit_logs_read on am_audit_logs;
create policy am_audit_logs_read on am_audit_logs for select to authenticated using (am_is_admin());

drop policy am_error_logs_authenticated_all on am_error_logs;
create policy am_error_logs_select on am_error_logs for select to authenticated using (am_is_admin());
create policy am_error_logs_insert on am_error_logs for insert to authenticated with check (true);
