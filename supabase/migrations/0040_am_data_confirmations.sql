-- Public "confirm your details" page — a student/parent who received their
-- S{yy}-N reference code (the same code their approved application got —
-- see 0017/0031's am_submit_public_application) can look up that one year's
-- record, check it's correct, and optionally leave a free-text note if
-- something's wrong. Nothing here ever writes directly to am_students or
-- am_academic_records — a note always lands as its own row for staff to
-- read and act on by hand, same "public write never touches the live
-- roster directly" posture as am_public_submissions itself.

-- ---------------------------------------------------------------- table
create table am_data_confirmations (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references am_organizations(id) on delete cascade,
  academic_record_id uuid not null references am_academic_records(id) on delete cascade,
  reference_code     text not null,
  contact_no         text not null,
  has_changes        boolean not null default false,
  note               text,
  created_at         timestamptz not null default now()
);

create index am_data_confirmations_record_idx on am_data_confirmations (academic_record_id);
create index am_data_confirmations_org_idx on am_data_confirmations (org_id, created_at desc);

alter table am_data_confirmations enable row level security;

-- Piggybacks on the existing Submissions module rather than adding a new
-- am_module enum value for what's a small, closely-related surface (staff
-- reviewing something the public sent in, same as Submissions itself) —
-- see lib/types.ts MODULES for the enum this reuses.
create policy am_data_confirmations_select on am_data_confirmations
  for select to authenticated using (am_has_permission('submissions'::am_module, 'read'));
create policy am_data_confirmations_delete on am_data_confirmations
  for delete to authenticated using (am_has_permission('submissions'::am_module, 'delete'));
-- No insert/update policy for authenticated or anon — every write goes
-- through am_submit_data_confirmation below, which re-verifies the
-- code+phone match itself rather than trusting the caller already did.

-- ---------------------------------------------------------------- lookup
-- Matches an approved submission's reference_code (org-scoped) to its
-- academic record, then requires the *current* student contact_no to match
-- — not the submission's original one, so a student who already corrected
-- their number via a previous confirmation keeps working with the new one.
-- Returns null (never an error) on any mismatch, so a wrong code and a
-- wrong phone number look identical from the outside.
create or replace function am_confirm_lookup(p_org_id uuid, p_reference_code text, p_contact_no text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_academic_record_id uuid;
  v_contact_no text;
  v_result jsonb;
begin
  select s.academic_record_id into v_academic_record_id
  from am_public_submissions s
  where s.org_id = p_org_id
    and s.reference_code = p_reference_code
    and s.status = 'approved'
    and s.academic_record_id is not null;

  if v_academic_record_id is null then
    return null;
  end if;

  select st.contact_no into v_contact_no
  from am_academic_records r
  join am_students st on st.id = r.student_id
  where r.id = v_academic_record_id;

  if v_contact_no is null or trim(v_contact_no) is distinct from trim(p_contact_no) then
    return null;
  end if;

  select jsonb_build_object(
    'academic_record_id', r.id,
    'salutation', st.salutation,
    'first_name', st.first_name,
    'middle_name', st.middle_name,
    'last_name', st.last_name,
    'email', st.email,
    'contact_no', st.contact_no,
    'institution_name', i.name,
    'institution_type', i.type,
    'academic_year_label', ay.label,
    'standard_label', sd.label,
    'stream_name', strm.name,
    'course_name', cr.name,
    'course_structure_type', cr.structure_type,
    'period_no', r.period_no,
    'percentage', r.percentage,
    'grade', r.grade,
    'roll_no', r.roll_no
  )
  into v_result
  from am_academic_records r
  join am_students st on st.id = r.student_id
  left join am_institutions i on i.id = r.institution_id
  left join am_academic_years ay on ay.id = r.academic_year_id
  left join am_standards sd on sd.id = r.standard_id
  left join am_courses cr on cr.id = r.course_id
  left join am_streams strm on strm.id = r.stream_id
  where r.id = v_academic_record_id;

  return v_result;
end;
$$;

revoke all on function am_confirm_lookup(uuid, text, text) from public;
grant execute on function am_confirm_lookup(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- submit
-- Re-runs the exact same lookup rather than trusting the client already
-- did — the client can't forge a confirmation for a record it couldn't
-- actually verify.
create or replace function am_submit_data_confirmation(
  p_org_id uuid, p_reference_code text, p_contact_no text, p_note text, p_has_changes boolean
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_academic_record_id uuid;
  v_id uuid;
begin
  select (am_confirm_lookup(p_org_id, p_reference_code, p_contact_no) ->> 'academic_record_id')::uuid
    into v_academic_record_id;

  if v_academic_record_id is null then
    raise exception 'We could not verify your details — check your number and mobile number';
  end if;

  insert into am_data_confirmations (org_id, academic_record_id, reference_code, contact_no, has_changes, note)
  values (
    p_org_id, v_academic_record_id, p_reference_code, trim(p_contact_no),
    p_has_changes, nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function am_submit_data_confirmation(uuid, text, text, text, boolean) from public;
grant execute on function am_submit_data_confirmation(uuid, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- form metadata
-- The confirm page shows a fixed "S{yy}-" prefix next to a plain number
-- field rather than making the applicant type the whole code — this tells
-- the page what that prefix is for the org's *active* academic year, using
-- the exact same "S" + last-2-digits-of-the-year-label scheme
-- am_submit_public_application already uses when it mints the codes, so
-- they can never drift apart. Also doubles as "is a year even active right
-- now" for the page's empty state.
create or replace function am_confirm_form_meta(p_org_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_label text;
  v_short text;
begin
  select label into v_label
  from am_academic_years
  where org_id = p_org_id and is_active
  order by created_at desc
  limit 1;

  if v_label is null then
    return jsonb_build_object('year_label', null, 'prefix', null);
  end if;

  v_short := coalesce(right(substring(v_label from '\d{4}'), 2), to_char(now(), 'YY'));
  return jsonb_build_object('year_label', v_label, 'prefix', 'S' || v_short || '-');
end;
$$;

revoke all on function am_confirm_form_meta(uuid) from public;
grant execute on function am_confirm_form_meta(uuid) to anon, authenticated;
