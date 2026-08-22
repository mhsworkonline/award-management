-- Reconciled from supabase_migrations.schema_migrations (version 20260820092044).

drop function if exists am_submit_public_application(uuid,uuid,text,text,text,text,text,uuid,text,uuid,text,uuid,uuid,text,text,int,text,numeric,text,text,text);

create or replace function am_submit_public_application(
  p_org_id                 uuid,
  p_form_id                uuid,
  p_salutation             text,
  p_first_name             text,
  p_middle_name            text,
  p_last_name              text,
  p_email                  text,
  p_contact_no             text,
  p_institution_id         uuid,
  p_other_institution_name text,
  p_board_id               uuid,
  p_other_board_name       text,
  p_standard_id            uuid,
  p_course_id              uuid,
  p_other_course_name      text,
  p_other_course_structure text,
  p_period_no              int,
  p_roll_no                text,
  p_percentage             numeric,
  p_grade                  text,
  p_notes                  text,
  p_ip_hash                text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_id  uuid;
  v_enabled  boolean;
  v_recent   int;
  v_id       uuid;
  v_code     text;
  v_exists   boolean;
  v_tries    int := 0;
  v_grade    text := nullif(trim(coalesce(p_grade, '')), '');
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
  if coalesce(trim(p_email), '') = '' or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required';
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

  loop
    v_code := 'AWD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    select exists(select 1 from am_public_submissions where reference_code = v_code) into v_exists;
    v_tries := v_tries + 1;
    exit when not v_exists or v_tries > 5;
  end loop;

  insert into am_public_submissions (
    org_id, form_id, salutation, first_name, middle_name, last_name, email, contact_no,
    institution_id, other_institution_name, board_id, other_board_name, academic_year_id,
    standard_id, course_id, other_course_name, other_course_structure, period_no,
    roll_no, percentage, grade, notes, ip_hash, reference_code
  ) values (
    p_org_id, p_form_id, nullif(trim(coalesce(p_salutation, '')), ''), trim(p_first_name), nullif(trim(coalesce(p_middle_name, '')), ''), trim(p_last_name),
    lower(trim(p_email)), nullif(trim(coalesce(p_contact_no, '')), ''),
    p_institution_id, nullif(trim(coalesce(p_other_institution_name, '')), ''),
    p_board_id, nullif(trim(coalesce(p_other_board_name, '')), ''), v_year_id,
    p_standard_id, p_course_id, nullif(trim(coalesce(p_other_course_name, '')), ''), p_other_course_structure, p_period_no,
    nullif(trim(coalesce(p_roll_no, '')), ''), p_percentage, v_grade,
    nullif(trim(coalesce(p_notes, '')), ''), p_ip_hash, v_code
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'reference_code', v_code);
end;
$$;

revoke all on function am_submit_public_application(uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,text,uuid,uuid,text,text,int,text,numeric,text,text,text) from public;
grant execute on function am_submit_public_application(uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,text,uuid,uuid,text,text,int,text,numeric,text,text,text) to anon, authenticated;
