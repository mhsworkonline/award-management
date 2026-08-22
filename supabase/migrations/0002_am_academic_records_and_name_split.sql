-- Reconciled from supabase_migrations.schema_migrations (version 20260730133446).
-- This file did not previously exist in the repo — the live database had
-- already diverged from 0001_init.sql. See 0001_init.sql's header note.

-- Clean rebuild of the student-identity chain: distribution -> allocation -> award -> student.
-- Existing rows are test remnants only (verified count: 1 student, 0 awards/allocations/distributions).
drop table if exists am_distribution_records cascade;
drop table if exists am_gift_allocations cascade;
drop table if exists am_student_awards cascade;
drop table if exists am_students cascade;

-- ---------------------------------------------------------------- students (persistent identity)
create table am_students (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references am_organizations(id) on delete cascade,
  first_name  text not null,
  middle_name text,                    -- father's first name, per convention
  last_name   text not null,
  contact_no  text,
  remarks     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index am_students_name_trgm on am_students using gin (
  (coalesce(first_name,'') || ' ' || coalesce(middle_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops
);
create index am_students_dupe_key on am_students (
  org_id,
  lower(regexp_replace(first_name, '\s+', ' ', 'g')),
  lower(coalesce(regexp_replace(middle_name, '\s+', ' ', 'g'), '')),
  lower(regexp_replace(last_name, '\s+', ' ', 'g'))
);

-- ---------------------------------------------------------------- academic records (per year enrollment + performance)
create table am_academic_records (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references am_organizations(id) on delete cascade,
  student_id       uuid not null references am_students(id) on delete cascade,
  academic_year_id uuid not null references am_academic_years(id) on delete cascade,
  institution_id   uuid not null references am_institutions(id) on delete cascade,
  standard_id      uuid references am_standards(id) on delete set null,
  course_id        uuid references am_courses(id) on delete set null,
  period_no        int check (period_no between 1 and 12),
  roll_no          text,
  percentage       numeric(5,2) check (percentage between 0 and 100),
  grade            text,
  rank             int check (rank > 0),
  remarks          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint am_academic_records_placement_ck check (standard_id is not null or course_id is not null),
  unique (student_id, academic_year_id)
);
create index am_academic_records_year_idx on am_academic_records (org_id, academic_year_id);
create index am_academic_records_inst_year_idx on am_academic_records (org_id, institution_id, academic_year_id);
create index am_academic_records_standard_idx on am_academic_records (academic_year_id, standard_id);
create index am_academic_records_course_idx on am_academic_records (academic_year_id, course_id, period_no);

-- ---------------------------------------------------------------- awards (now attach to a year's academic record)
create table am_student_awards (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references am_organizations(id) on delete cascade,
  academic_record_id  uuid not null references am_academic_records(id) on delete cascade,
  award_category_id   uuid not null references am_award_categories(id) on delete restrict,
  subject_or_criteria text,
  created_at          timestamptz not null default now(),
  unique (academic_record_id, award_category_id)
);
create index am_student_awards_org_idx on am_student_awards (org_id);
create index am_student_awards_category_idx on am_student_awards (award_category_id);

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
  constraint am_distributed_needs_timestamp check (status <> 'distributed' or distributed_at is not null)
);
create index am_distribution_status_idx on am_distribution_records (org_id, status);

create trigger am_gift_allocations_create_distribution
after insert on am_gift_allocations
for each row execute function am_tg_create_distribution_record();

create trigger am_gift_allocations_restore_stock
after delete on am_gift_allocations
for each row execute function am_tg_restore_gift_stock();

create trigger am_students_touch before update on am_students
for each row execute function am_tg_touch_updated_at();

create trigger am_academic_records_touch before update on am_academic_records
for each row execute function am_tg_touch_updated_at();

create trigger am_distribution_records_touch before update on am_distribution_records
for each row execute function am_tg_touch_updated_at();

-- ---------------------------------------------------------------- allocate_gift now keyed by academic_record
create or replace function am_allocate_gift(
  p_org_id           uuid,
  p_student_award_id uuid,
  p_gift_item_id     uuid,
  p_quantity         int
) returns uuid
language plpgsql security invoker set search_path = public as $$
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

  update am_gift_items set quantity_on_hand = quantity_on_hand - p_quantity where id = p_gift_item_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- standards: LKG, UKG below Std 1
alter table am_standards drop constraint if exists am_standards_level_check;
alter table am_standards add constraint am_standards_level_check check (level between -2 and 12);
-- -2 = LKG, -1 = UKG, 1..12 = Std 1..12 (0 intentionally skipped, reads oddly in sort)

-- ---------------------------------------------------------------- colleges get a board/university field too
alter table am_courses add column if not exists board_id uuid references am_boards(id) on delete set null;
update am_boards set applies_to = 'both' where applies_to = 'school';

-- ---------------------------------------------------------------- RLS on the two rebuilt/new tables
alter table am_students enable row level security;
create policy am_students_authenticated_all on am_students for all to authenticated using (true) with check (true);

alter table am_academic_records enable row level security;
create policy am_academic_records_authenticated_all on am_academic_records for all to authenticated using (true) with check (true);

alter table am_student_awards enable row level security;
create policy am_student_awards_authenticated_all on am_student_awards for all to authenticated using (true) with check (true);

alter table am_gift_allocations enable row level security;
create policy am_gift_allocations_authenticated_all on am_gift_allocations for all to authenticated using (true) with check (true);

alter table am_distribution_records enable row level security;
create policy am_distribution_records_authenticated_all on am_distribution_records for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------- standards seed: LKG, UKG
insert into am_standards (org_id, level, label) values
  ('00000000-0000-0000-0000-000000000001', -2, 'LKG'),
  ('00000000-0000-0000-0000-000000000001', -1, 'UKG')
on conflict (org_id, level) do nothing;
