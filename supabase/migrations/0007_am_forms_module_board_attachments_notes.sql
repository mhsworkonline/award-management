-- Reconciled from supabase_migrations.schema_migrations (version 20260820084640).

-- ---------------------------------------------------------------- forms module
create table am_application_forms (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references am_organizations(id) on delete cascade,
  slug             text not null,
  title            text not null,
  academic_year_id uuid not null references am_academic_years(id) on delete cascade,
  is_enabled       boolean not null default true,
  created_by       text,
  created_at       timestamptz not null default now(),
  unique (org_id, slug)
);
create index am_application_forms_org_idx on am_application_forms (org_id, is_enabled);

alter table am_application_forms enable row level security;
create policy am_application_forms_authenticated_all on am_application_forms
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------- submissions: form link, board, notes
alter table am_public_submissions add column if not exists form_id uuid references am_application_forms(id) on delete set null;
alter table am_public_submissions add column if not exists board_id uuid references am_boards(id) on delete set null;
alter table am_public_submissions add column if not exists other_board_name text;
alter table am_public_submissions add column if not exists notes text;

alter table am_public_submissions add constraint am_public_submissions_board_ck check (
  standard_id is null or board_id is not null or other_board_name is not null
);

update am_public_submissions set percentage = 0 where percentage is null;
update am_public_submissions set grade = '-' where grade is null;
alter table am_public_submissions alter column percentage set not null;
alter table am_public_submissions alter column grade set not null;

-- ---------------------------------------------------------------- attachments
create table am_submission_attachments (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references am_organizations(id) on delete cascade,
  submission_id uuid not null references am_public_submissions(id) on delete cascade,
  file_path    text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   int not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at   timestamptz not null default now()
);
create index am_submission_attachments_sub_idx on am_submission_attachments (submission_id);

alter table am_submission_attachments enable row level security;
create policy am_submission_attachments_authenticated_all on am_submission_attachments
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------- storage bucket (shared project — scoped policies only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'am-submission-attachments', 'am-submission-attachments', false, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy am_attachments_anon_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'am-submission-attachments');

create policy am_attachments_authenticated_select on storage.objects
  for select to authenticated
  using (bucket_id = 'am-submission-attachments');

create policy am_attachments_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'am-submission-attachments');

-- ---------------------------------------------------------------- resolve a public form (by slug, or the org's default)
create or replace function am_resolve_application_form(p_org_id uuid, p_slug text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case when f.id is null then null else jsonb_build_object(
    'id', f.id, 'slug', f.slug, 'title', f.title, 'is_enabled', f.is_enabled,
    'academicYear', jsonb_build_object('id', y.id, 'label', y.label)
  ) end
  from (
    select * from am_application_forms
    where org_id = p_org_id
      and (
        (p_slug is not null and slug = p_slug)
        or (p_slug is null and is_enabled = true)
      )
    order by
      (p_slug is null and academic_year_id in (select id from am_academic_years where org_id = p_org_id and is_active = true)) desc,
      created_at desc
    limit 1
  ) f
  join am_academic_years y on y.id = f.academic_year_id;
$$;

revoke all on function am_resolve_application_form(uuid, text) from public;
grant execute on function am_resolve_application_form(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------- register an attachment (metadata only — the file itself
-- already landed in Storage via the anon insert policy above)
create or replace function am_register_submission_attachment(
  p_org_id        uuid,
  p_submission_id uuid,
  p_file_path     text,
  p_file_name     text,
  p_mime_type     text,
  p_size_bytes    int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_id    uuid;
begin
  if not exists (select 1 from am_public_submissions where id = p_submission_id and org_id = p_org_id and status = 'pending') then
    raise exception 'Submission not found';
  end if;

  select count(*) into v_count from am_submission_attachments where submission_id = p_submission_id;
  if v_count >= 2 then
    raise exception 'Maximum 2 attachments per application';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 5242880 then
    raise exception 'File must be 5MB or smaller';
  end if;

  if p_mime_type not in (
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'Only images, PDF or DOCX files are allowed';
  end if;

  insert into am_submission_attachments (org_id, submission_id, file_path, file_name, mime_type, size_bytes)
  values (p_org_id, p_submission_id, p_file_path, p_file_name, p_mime_type, p_size_bytes)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function am_register_submission_attachment(uuid,uuid,text,text,text,int) from public;
grant execute on function am_register_submission_attachment(uuid,uuid,text,text,text,int) to anon, authenticated;

-- ---------------------------------------------------------------- rebuild submit function: form-scoped year, board, notes, mandatory grade
drop function if exists am_submit_public_application(uuid,text,text,text,text,text,uuid,text,uuid,uuid,text,text,int,text,numeric,text,text);

create or replace function am_submit_public_application(
  p_org_id                 uuid,
  p_form_id                uuid,
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

  if p_percentage is null or p_percentage < 0 or p_percentage > 100 then
    raise exception 'Percentage is required and must be between 0 and 100';
  end if;
  if coalesce(trim(p_grade), '') = '' then
    raise exception 'Grade is required';
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
    org_id, form_id, first_name, middle_name, last_name, email, contact_no,
    institution_id, other_institution_name, board_id, other_board_name, academic_year_id,
    standard_id, course_id, other_course_name, other_course_structure, period_no,
    roll_no, percentage, grade, notes, ip_hash, reference_code
  ) values (
    p_org_id, p_form_id, trim(p_first_name), nullif(trim(coalesce(p_middle_name, '')), ''), trim(p_last_name),
    lower(trim(p_email)), nullif(trim(coalesce(p_contact_no, '')), ''),
    p_institution_id, nullif(trim(coalesce(p_other_institution_name, '')), ''),
    p_board_id, nullif(trim(coalesce(p_other_board_name, '')), ''), v_year_id,
    p_standard_id, p_course_id, nullif(trim(coalesce(p_other_course_name, '')), ''), p_other_course_structure, p_period_no,
    nullif(trim(coalesce(p_roll_no, '')), ''), p_percentage, trim(p_grade),
    nullif(trim(coalesce(p_notes, '')), ''), p_ip_hash, v_code
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'reference_code', v_code);
end;
$$;

revoke all on function am_submit_public_application(uuid,uuid,text,text,text,text,text,uuid,text,uuid,text,uuid,uuid,text,text,int,text,numeric,text,text,text) from public;
grant execute on function am_submit_public_application(uuid,uuid,text,text,text,text,text,uuid,text,uuid,text,uuid,uuid,text,text,int,text,numeric,text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------- default form so the existing shared link keeps working
insert into am_application_forms (org_id, slug, title, academic_year_id, is_enabled)
select '00000000-0000-0000-0000-000000000001', 'default', 'Award Application ' || label, id, true
from am_academic_years where org_id = '00000000-0000-0000-0000-000000000001' and is_active = true
on conflict (org_id, slug) do nothing;
