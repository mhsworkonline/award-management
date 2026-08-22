-- Reconciled from supabase_migrations.schema_migrations (version 20260820073910).

create type am_submission_status as enum ('pending', 'approved', 'rejected');

alter table am_academic_records
  add column if not exists grade_source text not null default 'staff'
  check (grade_source in ('staff', 'self_reported'));

create table am_public_submissions (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references am_organizations(id) on delete cascade,
  first_name         text not null,
  middle_name        text,
  last_name          text not null,
  contact_no         text,
  institution_id     uuid not null references am_institutions(id) on delete cascade,
  academic_year_id   uuid not null references am_academic_years(id) on delete cascade,
  standard_id        uuid references am_standards(id) on delete set null,
  course_id          uuid references am_courses(id) on delete set null,
  period_no          int check (period_no between 1 and 12),
  roll_no            text,
  percentage         numeric(5,2) check (percentage between 0 and 100),
  grade              text,
  status             am_submission_status not null default 'pending',
  ip_hash            text,
  student_id         uuid references am_students(id) on delete set null,
  academic_record_id uuid references am_academic_records(id) on delete set null,
  reviewed_by        text,
  reviewed_at        timestamptz,
  rejection_reason   text,
  created_at         timestamptz not null default now(),
  constraint am_public_submissions_placement_ck check (standard_id is not null or course_id is not null)
);
create index am_public_submissions_status_idx on am_public_submissions (org_id, status, created_at desc);
create index am_public_submissions_ip_idx on am_public_submissions (ip_hash, created_at desc);

alter table am_public_submissions enable row level security;
-- Staff only. No anon policy at all — public writes go exclusively through the
-- security-definer function below, never through a direct table insert.
create policy am_public_submissions_authenticated_all on am_public_submissions
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------- public read (form options)
-- Returns only the columns a public applicant needs to see — never the full
-- institutions/boards/courses tables, and never anything from students/records.
create or replace function am_public_form_options(p_org_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'institutions', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'type', type, 'board_id', board_id) order by name)
      from am_institutions where org_id = p_org_id
    ), '[]'::jsonb),
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
      from am_boards where org_id = p_org_id
    ), '[]'::jsonb),
    'standards', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'level', level) order by level)
      from am_standards where org_id = p_org_id
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'structure_type', structure_type, 'total_periods', total_periods) order by name)
      from am_courses where org_id = p_org_id
    ), '[]'::jsonb),
    'academicYear', (
      select jsonb_build_object('id', id, 'label', label)
      from am_academic_years where org_id = p_org_id and is_active = true
      limit 1
    )
  );
$$;

-- ---------------------------------------------------------------- public write (submit)
create or replace function am_submit_public_application(
  p_org_id         uuid,
  p_first_name     text,
  p_middle_name    text,
  p_last_name      text,
  p_contact_no     text,
  p_institution_id uuid,
  p_standard_id    uuid,
  p_course_id      uuid,
  p_period_no      int,
  p_roll_no        text,
  p_percentage     numeric,
  p_grade          text,
  p_ip_hash        text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_id  uuid;
  v_recent   int;
  v_id       uuid;
begin
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'First and last name are required';
  end if;
  if p_institution_id is null or not exists (select 1 from am_institutions where id = p_institution_id and org_id = p_org_id) then
    raise exception 'Select a valid institution';
  end if;
  if p_standard_id is null and p_course_id is null then
    raise exception 'Select a standard or a course';
  end if;
  if p_percentage is not null and (p_percentage < 0 or p_percentage > 100) then
    raise exception 'Percentage must be between 0 and 100';
  end if;

  select id into v_year_id from am_academic_years where org_id = p_org_id and is_active = true limit 1;
  if v_year_id is null then
    raise exception 'No active academic year configured';
  end if;

  if p_ip_hash is not null then
    select count(*) into v_recent
    from am_public_submissions
    where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes';
    if v_recent >= 5 then
      raise exception 'Too many submissions from this device. Please try again in a few minutes.';
    end if;
  end if;

  insert into am_public_submissions (
    org_id, first_name, middle_name, last_name, contact_no,
    institution_id, academic_year_id, standard_id, course_id, period_no,
    roll_no, percentage, grade, ip_hash
  ) values (
    p_org_id, trim(p_first_name), nullif(trim(coalesce(p_middle_name, '')), ''), trim(p_last_name), nullif(trim(coalesce(p_contact_no, '')), ''),
    p_institution_id, v_year_id, p_standard_id, p_course_id, p_period_no,
    nullif(trim(coalesce(p_roll_no, '')), ''), p_percentage, nullif(trim(coalesce(p_grade, '')), ''), p_ip_hash
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function am_public_form_options(uuid) from public;
revoke all on function am_submit_public_application(uuid,text,text,text,text,uuid,uuid,uuid,int,text,numeric,text,text) from public;
grant execute on function am_public_form_options(uuid) to anon, authenticated;
grant execute on function am_submit_public_application(uuid,text,text,text,text,uuid,uuid,uuid,int,text,numeric,text,text) to anon, authenticated;
