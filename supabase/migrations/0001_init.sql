-- Award Management — initial schema
-- Deployed into a SHARED Supabase project, so every table, enum type, function,
-- trigger and named index carries the am_ prefix to avoid colliding with the
-- other applications living in the public schema.
-- Single organization now; org_id present on every table for future multi-tenancy.

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- enums
create type am_institution_type as enum ('school', 'college');
create type am_applies_to_type  as enum ('school', 'college', 'both');
create type am_course_structure as enum ('year', 'semester');
create type am_distribution_status as enum ('pending', 'distributed');
create type am_sync_status_type as enum ('synced', 'queued_offline');
create type am_audit_action     as enum ('create', 'update', 'delete');

-- ---------------------------------------------------------------- org
create table am_organizations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- config / lookups
create table am_academic_years (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references am_organizations(id) on delete cascade,
  label      text not null,
  start_date date,
  end_date   date,
  is_active  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, label)
);
create index am_academic_years_active_idx on am_academic_years (org_id, is_active);

create table am_boards (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references am_organizations(id) on delete cascade,
  name       text not null,
  applies_to am_applies_to_type not null default 'school',
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table am_mediums (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references am_organizations(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table am_courses (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references am_organizations(id) on delete cascade,
  name           text not null,
  structure_type am_course_structure not null default 'year',
  total_periods  int not null default 4 check (total_periods between 1 and 12),
  created_at     timestamptz not null default now(),
  unique (org_id, name)
);

create table am_standards (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references am_organizations(id) on delete cascade,
  level      int not null check (level between 1 and 12),
  label      text not null,
  created_at timestamptz not null default now(),
  unique (org_id, level)
);

create table am_award_categories (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references am_organizations(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
create index am_award_categories_sort_idx on am_award_categories (org_id, sort_order);

-- ---------------------------------------------------------------- institutions
create table am_institutions (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references am_organizations(id) on delete cascade,
  name           text not null,
  type           am_institution_type not null,
  board_id       uuid references am_boards(id) on delete set null,
  medium_id      uuid references am_mediums(id) on delete set null,
  city           text,
  contact_person text,
  contact_no     text,
  created_at     timestamptz not null default now(),
  unique (org_id, name)
);
create index am_institutions_type_idx on am_institutions (org_id, type);
create index am_institutions_name_trgm on am_institutions using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------- students
create table am_students (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references am_organizations(id) on delete cascade,
  institution_id   uuid not null references am_institutions(id) on delete cascade,
  academic_year_id uuid not null references am_academic_years(id) on delete cascade,
  name             text not null,
  father_name      text,
  standard_id      uuid references am_standards(id) on delete set null,
  course_id        uuid references am_courses(id) on delete set null,
  period_no        int check (period_no between 1 and 12),
  roll_no          text,
  contact_no       text,
  remarks          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- a school student has a standard, a college student has a course + period
  constraint am_students_placement_ck check (standard_id is not null or course_id is not null)
);
create index am_students_year_idx on am_students (org_id, academic_year_id);
create index am_students_inst_year_idx on am_students (org_id, institution_id, academic_year_id);
create index am_students_name_trgm on am_students using gin (name gin_trgm_ops);
-- duplicate detection support: normalized (name, father_name) within institution + year
create index am_students_dupe_key on am_students (
  org_id, institution_id, academic_year_id,
  lower(regexp_replace(name, '\s+', ' ', 'g')),
  lower(coalesce(regexp_replace(father_name, '\s+', ' ', 'g'), ''))
);

-- ---------------------------------------------------------------- awards
create table am_student_awards (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references am_organizations(id) on delete cascade,
  student_id          uuid not null references am_students(id) on delete cascade,
  academic_year_id    uuid not null references am_academic_years(id) on delete cascade,
  award_category_id   uuid not null references am_award_categories(id) on delete restrict,
  subject_or_criteria text,
  created_at          timestamptz not null default now(),
  unique (student_id, academic_year_id, award_category_id)
);
create index am_student_awards_year_idx on am_student_awards (org_id, academic_year_id);
create index am_student_awards_category_idx on am_student_awards (award_category_id);

-- ---------------------------------------------------------------- gifts
create table am_gift_items (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references am_organizations(id) on delete cascade,
  name             text not null,
  sku              text,
  unit_cost        numeric(12,2) not null default 0 check (unit_cost >= 0),
  quantity_on_hand int not null default 0 check (quantity_on_hand >= 0),
  created_at       timestamptz not null default now(),
  unique (org_id, name)
);

create table am_gift_allocations (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references am_organizations(id) on delete cascade,
  student_award_id uuid not null references am_student_awards(id) on delete cascade,
  gift_item_id     uuid not null references am_gift_items(id) on delete restrict,
  quantity         int not null default 1 check (quantity > 0),
  created_at       timestamptz not null default now(),
  unique (student_award_id, gift_item_id)
);
create index am_gift_allocations_org_idx on am_gift_allocations (org_id);
create index am_gift_allocations_item_idx on am_gift_allocations (gift_item_id);

create table am_distribution_records (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references am_organizations(id) on delete cascade,
  gift_allocation_id uuid not null unique references am_gift_allocations(id) on delete cascade,
  status             am_distribution_status not null default 'pending',
  distributed_at     timestamptz,
  distributed_by     text,
  sync_status        am_sync_status_type not null default 'synced',
  local_uuid         uuid unique,
  updated_at         timestamptz not null default now(),
  constraint am_distributed_needs_timestamp
    check (status <> 'distributed' or distributed_at is not null)
);
create index am_distribution_status_idx on am_distribution_records (org_id, status);

-- every allocation gets a pending distribution row automatically
create or replace function am_tg_create_distribution_record() returns trigger
language plpgsql as $$
begin
  insert into am_distribution_records (org_id, gift_allocation_id)
  values (new.org_id, new.id)
  on conflict (gift_allocation_id) do nothing;
  return new;
end $$;

create trigger am_gift_allocations_create_distribution
after insert on am_gift_allocations
for each row execute function am_tg_create_distribution_record();

-- ---------------------------------------------------------------- audit + errors
create table am_audit_logs (
  id          bigserial primary key,
  org_id      uuid not null references am_organizations(id) on delete cascade,
  entity_name text not null,
  entity_id   text,
  action      am_audit_action not null,
  actor       text,
  diff_json   jsonb,
  created_at  timestamptz not null default now()
);
create index am_audit_logs_created_idx on am_audit_logs (org_id, created_at desc);
create index am_audit_logs_entity_idx on am_audit_logs (entity_name, created_at desc);

create table am_error_logs (
  id         bigserial primary key,
  org_id     uuid references am_organizations(id) on delete set null,
  route      text,
  message    text not null,
  stack      text,
  created_at timestamptz not null default now()
);
create index am_error_logs_created_idx on am_error_logs (created_at desc);

-- ---------------------------------------------------------------- atomic gift allocation
-- Enforces invariant: sum(allocated qty) per gift item <= quantity_on_hand
create or replace function am_allocate_gift(
  p_org_id           uuid,
  p_student_award_id uuid,
  p_gift_item_id     uuid,
  p_quantity         int
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_available int;
  v_id        uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select quantity_on_hand into v_available
  from am_gift_items
  where id = p_gift_item_id and org_id = p_org_id
  for update;

  if v_available is null then
    raise exception 'Gift item not found';
  end if;

  if v_available < p_quantity then
    raise exception 'Insufficient stock: % available, % requested', v_available, p_quantity;
  end if;

  insert into am_gift_allocations (org_id, student_award_id, gift_item_id, quantity)
  values (p_org_id, p_student_award_id, p_gift_item_id, p_quantity)
  returning id into v_id;

  update am_gift_items
  set quantity_on_hand = quantity_on_hand - p_quantity
  where id = p_gift_item_id;

  return v_id;
end $$;

-- Returning stock when an allocation is removed
create or replace function am_tg_restore_gift_stock() returns trigger
language plpgsql as $$
begin
  update am_gift_items
  set quantity_on_hand = quantity_on_hand + old.quantity
  where id = old.gift_item_id;
  return old;
end $$;

create trigger am_gift_allocations_restore_stock
after delete on am_gift_allocations
for each row execute function am_tg_restore_gift_stock();

-- ---------------------------------------------------------------- updated_at
create or replace function am_tg_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger am_students_touch before update on am_students
for each row execute function am_tg_touch_updated_at();

create trigger am_distribution_records_touch before update on am_distribution_records
for each row execute function am_tg_touch_updated_at();

-- ---------------------------------------------------------------- RLS
-- Single admin role: any authenticated user has full access. When multi-tenancy
-- arrives, replace `true` with an org membership check.
do $$
declare t text;
begin
  foreach t in array array[
    'am_organizations','am_academic_years','am_boards','am_mediums','am_courses',
    'am_standards','am_award_categories','am_institutions','am_students',
    'am_student_awards','am_gift_items','am_gift_allocations',
    'am_distribution_records','am_audit_logs','am_error_logs'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- audit logs are append-only for clients
drop policy am_audit_logs_authenticated_all on am_audit_logs;
create policy am_audit_logs_read   on am_audit_logs for select to authenticated using (true);
create policy am_audit_logs_insert on am_audit_logs for insert to authenticated with check (true);

-- ---------------------------------------------------------------- seed
insert into am_organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default Organization');

insert into am_boards (org_id, name, applies_to) values
  ('00000000-0000-0000-0000-000000000001', 'CBSE', 'school'),
  ('00000000-0000-0000-0000-000000000001', 'State Board', 'school'),
  ('00000000-0000-0000-0000-000000000001', 'ICSE', 'school');

insert into am_mediums (org_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'English'),
  ('00000000-0000-0000-0000-000000000001', 'Gujarati'),
  ('00000000-0000-0000-0000-000000000001', 'Hindi');

insert into am_standards (org_id, level, label)
select '00000000-0000-0000-0000-000000000001', g, 'Std ' || g
from generate_series(1, 12) g;

insert into am_courses (org_id, name, structure_type, total_periods) values
  ('00000000-0000-0000-0000-000000000001', 'MBBS',    'year',     5),
  ('00000000-0000-0000-0000-000000000001', 'BE',      'semester', 8),
  ('00000000-0000-0000-0000-000000000001', 'BTech',   'semester', 8),
  ('00000000-0000-0000-0000-000000000001', 'BCom',    'year',     3),
  ('00000000-0000-0000-0000-000000000001', 'BA',      'year',     3),
  ('00000000-0000-0000-0000-000000000001', 'MBA',     'semester', 4),
  ('00000000-0000-0000-0000-000000000001', 'Diploma', 'semester', 6);

insert into am_award_categories (org_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000001', 'No. 1',       1),
  ('00000000-0000-0000-0000-000000000001', 'No. 2',       2),
  ('00000000-0000-0000-0000-000000000001', 'No. 3',       3),
  ('00000000-0000-0000-0000-000000000001', 'Consolation', 4);

insert into am_academic_years (org_id, label, start_date, end_date, is_active) values
  ('00000000-0000-0000-0000-000000000001', '2026-27', '2026-06-01', '2027-04-30', true);
