-- Award Management — Stream (Arts/Commerce/Science) for Std 11 and 12.
--
-- School awards are decided by Standard alone, pooling every student in
-- that Standard across every institution, board and medium (see the
-- suggested-performers grouping added just before this). But Std 11/12
-- split into Arts/Commerce/Science, and those students sit different
-- subjects entirely — a raw percentage isn't comparable across streams the
-- same way it is within one. Stream is the missing axis for those two
-- Standards specifically; every other Standard has no such concept.
--
-- A lookup table, not a hardcoded enum — same pattern as am_boards/
-- am_mediums/am_courses ("everything here is data, not code," per
-- Settings' own description). stream_id is added in exactly the two
-- places standard_id already lives: am_academic_records (the actual
-- per-year record) and am_public_submissions (the public form's draft of
-- one, before approval creates the real record).

create table am_streams (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references am_organizations(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table am_streams enable row level security;
create policy am_streams_authenticated_all on am_streams for all to authenticated using (true) with check (true);

insert into am_streams (org_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Arts'),
  ('00000000-0000-0000-0000-000000000001', 'Commerce'),
  ('00000000-0000-0000-0000-000000000001', 'Science')
on conflict (org_id, name) do nothing;

alter table am_academic_records add column stream_id uuid references am_streams(id) on delete set null;
create index am_academic_records_stream_idx on am_academic_records (stream_id);

alter table am_public_submissions add column stream_id uuid references am_streams(id) on delete set null;
create index am_public_submissions_stream_idx on am_public_submissions (stream_id);

-- Both option RPCs: same signature, just a body change, so a plain
-- create-or-replace is enough (no drop needed — see 0020/0028 for when an
-- actual parameter-list change forces one, which is the case below for
-- am_submit_public_application).

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
    'mediums', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
      from am_mediums where org_id = p_org_id
    ), '[]'::jsonb),
    'standards', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'level', level) order by level)
      from am_standards where org_id = p_org_id
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'structure_type', structure_type, 'total_periods', total_periods) order by name)
      from am_courses where org_id = p_org_id
    ), '[]'::jsonb),
    'streams', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
      from am_streams where org_id = p_org_id
    ), '[]'::jsonb),
    'academicYear', (
      select jsonb_build_object('id', id, 'label', label)
      from am_academic_years where org_id = p_org_id and is_active = true
      limit 1
    )
  );
$$;

create or replace function am_get_lookups(p_org_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'academicYears', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.label desc)
      from am_academic_years t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'boards', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from am_boards t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'mediums', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from am_mediums t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from am_courses t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'standards', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.level)
      from am_standards t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'awardCategories', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order)
      from am_award_categories t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'giftItems', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from am_gift_items t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'institutions', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', id, 'name', name, 'type', type, 'board_id', board_id, 'medium_id', medium_id)
        order by name
      )
      from am_institutions where org_id = p_org_id
    ), '[]'::jsonb),
    'streams', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from am_streams t where t.org_id = p_org_id
    ), '[]'::jsonb)
  );
$$;

-- Adding a parameter changes the signature, so the old overload has to be
-- dropped explicitly first — a plain create-or-replace would just add a
-- second, ambiguous overload instead of replacing it (see 0020/0028).
drop function if exists am_submit_public_application(uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,text,uuid,uuid,uuid,text,text,integer,text,numeric,text,text,text,text,text);

create or replace function public.am_submit_public_application(
  p_org_id uuid, p_form_id uuid, p_salutation text, p_first_name text, p_middle_name text,
  p_last_name text, p_email text, p_contact_no text, p_institution_id uuid,
  p_other_institution_name text, p_board_id uuid, p_other_board_name text, p_medium_id uuid,
  p_standard_id uuid, p_course_id uuid, p_other_course_name text, p_other_course_structure text,
  p_period_no integer, p_roll_no text, p_percentage numeric, p_grade text, p_notes text,
  p_ip_hash text, p_photo_path text, p_lanedaar_name text, p_stream_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year_id       uuid;
  v_year_label    text;
  v_year_short    text;
  v_enabled       boolean;
  v_recent        int;
  v_id            uuid;
  v_code          text;
  v_seq           int;
  v_exists        boolean;
  v_grade         text := nullif(trim(coalesce(p_grade, '')), '');
  v_standard_level int;
  v_stream_id     uuid;
begin
  select academic_year_id, is_enabled into v_year_id, v_enabled
  from am_application_forms where id = p_form_id and org_id = p_org_id;
  if v_year_id is null then
    raise exception 'This application form is not available';
  end if;
  if not v_enabled then
    raise exception 'This application form is not currently accepting submissions';
  end if;

  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'First and last name are required';
  end if;
  if coalesce(trim(p_middle_name), '') = '' then
    raise exception 'Middle name (father''s/husband''s name) is required';
  end if;
  if coalesce(trim(p_lanedaar_name), '') = '' then
    raise exception 'Lanedaar name is required';
  end if;
  if coalesce(trim(p_email), '') = '' or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required';
  end if;
  if p_contact_no !~ '^\d{10}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  if coalesce(trim(p_photo_path), '') = '' then
    raise exception 'Upload a photograph of the student';
  end if;

  if p_institution_id is not null then
    if not exists (select 1 from am_institutions where id = p_institution_id and org_id = p_org_id) then
      raise exception 'Select a valid institution';
    end if;
  elsif coalesce(trim(p_other_institution_name), '') = '' then
    raise exception 'Enter your institution name';
  end if;

  if p_standard_id is not null then
    if p_board_id is not null then
      if not exists (select 1 from am_boards where id = p_board_id and org_id = p_org_id) then
        raise exception 'Select a valid board';
      end if;
    elsif coalesce(trim(p_other_board_name), '') = '' then
      raise exception 'Select your board';
    end if;

    if p_medium_id is null or not exists (select 1 from am_mediums where id = p_medium_id and org_id = p_org_id) then
      raise exception 'Select your medium of instruction';
    end if;

    select level into v_standard_level from am_standards where id = p_standard_id and org_id = p_org_id;
    if v_standard_level in (11, 12) then
      if p_stream_id is null or not exists (select 1 from am_streams where id = p_stream_id and org_id = p_org_id) then
        raise exception 'Select your stream';
      end if;
      v_stream_id := p_stream_id;
    end if;
  end if;

  if p_standard_id is null and p_course_id is null then
    if coalesce(trim(p_other_course_name), '') = '' then
      raise exception 'Select a standard or a course';
    end if;
    if coalesce(p_other_course_structure, '') not in ('year','semester') then
      raise exception 'Select whether your course is year-based or semester-based';
    end if;
    if p_period_no is null or p_period_no < 1 or p_period_no > 12 then
      raise exception 'Enter your current year/semester number';
    end if;
  end if;

  if p_percentage is not null and (p_percentage < 0 or p_percentage > 100) then
    raise exception 'Percentage must be between 0 and 100';
  end if;
  if p_percentage is null and v_grade is null then
    raise exception 'Enter your percentage or grade (at least one is required)';
  end if;

  if p_ip_hash is not null then
    select count(*) into v_recent
    from am_public_submissions
    where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes';
    if v_recent >= 5 then
      raise exception 'Too many submissions from this device. Please try again in a few minutes.';
    end if;
  end if;

  select label into v_year_label from am_academic_years where id = v_year_id;
  v_year_short := coalesce(right(substring(v_year_label from '\d{4}'), 2), to_char(now(), 'YY'));

  perform pg_advisory_xact_lock(hashtext('am_reference_code'), hashtext(v_year_id::text));
  select count(*) into v_seq from am_public_submissions where academic_year_id = v_year_id;
  v_seq := v_seq + 1;
  loop
    v_code := 'S' || v_year_short || '-' || v_seq;
    select exists(select 1 from am_public_submissions where reference_code = v_code) into v_exists;
    exit when not v_exists;
    v_seq := v_seq + 1;
  end loop;

  insert into am_public_submissions (
    org_id, form_id, salutation, first_name, middle_name, last_name, lanedaar_name, email, contact_no,
    institution_id, other_institution_name, board_id, other_board_name, medium_id, academic_year_id,
    standard_id, stream_id, course_id, other_course_name, other_course_structure, period_no,
    roll_no, percentage, grade, notes, ip_hash, reference_code, photo_path
  ) values (
    p_org_id, p_form_id, nullif(trim(coalesce(p_salutation, '')), ''), trim(p_first_name), trim(p_middle_name), trim(p_last_name),
    trim(p_lanedaar_name), lower(trim(p_email)), trim(p_contact_no),
    p_institution_id, nullif(trim(coalesce(p_other_institution_name, '')), ''),
    p_board_id, nullif(trim(coalesce(p_other_board_name, '')), ''), p_medium_id, v_year_id,
    p_standard_id, v_stream_id, p_course_id, nullif(trim(coalesce(p_other_course_name, '')), ''), p_other_course_structure, p_period_no,
    nullif(trim(coalesce(p_roll_no, '')), ''), p_percentage, v_grade,
    nullif(trim(coalesce(p_notes, '')), ''), p_ip_hash, v_code, trim(p_photo_path)
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'reference_code', v_code);
end;
$function$;
