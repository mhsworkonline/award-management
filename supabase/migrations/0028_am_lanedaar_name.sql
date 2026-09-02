-- Award Management — "Lanedaar Name": the name of the person registered as
-- the family's main member, under whom other family members' applications
-- are related. New identity field alongside first/middle/last name — added
-- to every layer that already carries those: am_persons (the shared identity
-- anchor), am_students, and am_public_submissions (the public form's draft
-- row).
--
-- Required on the public application form (enforced in
-- am_submit_public_application below, since that function is SECURITY
-- DEFINER and callable by anon — client-side validation alone is never the
-- real gate). Optional everywhere staff edit identity directly, same
-- treatment as middle_name — some already-approved/legacy records won't
-- have one.

alter table am_persons add column lanedaar_name text;
alter table am_students add column lanedaar_name text;
alter table am_public_submissions add column lanedaar_name text;

-- ---------------------------------------------------------------- sync trigger
-- Keeps am_persons mirrored to am_students' identity columns — see
-- 0021_add_persons.sql for the original. Reissued here only to add
-- lanedaar_name to both branches.
create or replace function am_tg_sync_student_person() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    insert into am_persons (
      org_id, salutation, first_name, middle_name, last_name, lanedaar_name,
      email, contact_no, photo_path, created_at, updated_at
    )
    values (
      new.org_id, new.salutation, new.first_name, new.middle_name, new.last_name, new.lanedaar_name,
      new.email, new.contact_no, new.photo_path, now(), now()
    )
    returning id into new.person_id;
  elsif TG_OP = 'UPDATE' then
    update am_persons set
      org_id        = new.org_id,
      salutation    = new.salutation,
      first_name    = new.first_name,
      middle_name   = new.middle_name,
      last_name     = new.last_name,
      lanedaar_name = new.lanedaar_name,
      email         = new.email,
      contact_no    = new.contact_no,
      photo_path    = new.photo_path,
      updated_at    = now()
    where id = new.person_id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- am_submit_public_application
-- `create or replace function` with an added parameter creates a *new*
-- overload rather than replacing the old one — Postgres keys function
-- identity on the parameter signature (see 0020 for the same situation).
-- The old 24-arg version must be dropped explicitly so anon can't still
-- reach it and skip the new required-field check below.
drop function if exists public.am_submit_public_application(
  uuid, uuid, text, text, text, text, text, text, uuid, text, uuid, text, uuid, uuid, uuid, text, text,
  integer, text, numeric, text, text, text, text
);

create or replace function public.am_submit_public_application(
  p_org_id uuid, p_form_id uuid, p_salutation text, p_first_name text, p_middle_name text,
  p_last_name text, p_email text, p_contact_no text, p_institution_id uuid,
  p_other_institution_name text, p_board_id uuid, p_other_board_name text, p_medium_id uuid,
  p_standard_id uuid, p_course_id uuid, p_other_course_name text, p_other_course_structure text,
  p_period_no integer, p_roll_no text, p_percentage numeric, p_grade text, p_notes text,
  p_ip_hash text, p_photo_path text, p_lanedaar_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year_id    uuid;
  v_year_label text;
  v_year_short text;
  v_enabled    boolean;
  v_recent     int;
  v_id         uuid;
  v_code       text;
  v_seq        int;
  v_exists     boolean;
  v_grade      text := nullif(trim(coalesce(p_grade, '')), '');
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
  if coalesce(trim(p_contact_no), '') = '' then
    raise exception 'A contact number is required';
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
    standard_id, course_id, other_course_name, other_course_structure, period_no,
    roll_no, percentage, grade, notes, ip_hash, reference_code, photo_path
  ) values (
    p_org_id, p_form_id, nullif(trim(coalesce(p_salutation, '')), ''), trim(p_first_name), trim(p_middle_name), trim(p_last_name),
    trim(p_lanedaar_name), lower(trim(p_email)), trim(p_contact_no),
    p_institution_id, nullif(trim(coalesce(p_other_institution_name, '')), ''),
    p_board_id, nullif(trim(coalesce(p_other_board_name, '')), ''), p_medium_id, v_year_id,
    p_standard_id, p_course_id, nullif(trim(coalesce(p_other_course_name, '')), ''), p_other_course_structure, p_period_no,
    nullif(trim(coalesce(p_roll_no, '')), ''), p_percentage, v_grade,
    nullif(trim(coalesce(p_notes, '')), ''), p_ip_hash, v_code, trim(p_photo_path)
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'reference_code', v_code);
end;
$function$;
