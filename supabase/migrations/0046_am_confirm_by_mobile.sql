-- /confirm no longer asks for the S{yy}-N reference code — a student or parent
-- types only the registered mobile number, and every approved student for that
-- year registered under it is listed (siblings often share a parent's number).
-- Replaces 0040's code+phone am_confirm_lookup / am_submit_data_confirmation.
--
-- The mobile number alone is now the only credential, so two light safeguards:
-- the returned email is partially masked, and lookups are rate limited per
-- device (salted IP hash, never the raw IP) — generous enough that a family
-- checking several children is never blocked.

create table am_confirm_lookup_attempts (
  id         bigserial primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index am_confirm_lookup_attempts_idx on am_confirm_lookup_attempts (ip_hash, created_at desc);
-- No policies: only the security-definer lookup below ever touches it.
alter table am_confirm_lookup_attempts enable row level security;

drop function if exists am_confirm_lookup(uuid, text, text);
drop function if exists am_submit_data_confirmation(uuid, text, text, text, boolean);

-- ---------------------------------------------------------------- lookup
-- All approved students of one academic year whose current contact number
-- matches. Always returns an array ('[]' when none), so "no match" reveals
-- nothing beyond that.
create or replace function am_confirm_lookup_by_mobile(
  p_org_id uuid, p_year_id uuid, p_contact_no text, p_ip_hash text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_recent int;
  v_result jsonb;
begin
  if p_ip_hash is not null then
    delete from am_confirm_lookup_attempts where created_at < now() - interval '1 day';
    select count(*) into v_recent
    from am_confirm_lookup_attempts
    where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes';
    if v_recent >= 30 then
      raise exception 'Too many attempts from this device. Please try again in a few minutes.';
    end if;
    insert into am_confirm_lookup_attempts (ip_hash) values (p_ip_hash);
  end if;

  select coalesce(jsonb_agg(row_json order by sort_name), '[]'::jsonb)
  into v_result
  from (
    select
      lower(st.first_name || ' ' || coalesce(st.middle_name, '') || ' ' || st.last_name) as sort_name,
      jsonb_build_object(
        'academic_record_id', r.id,
        'salutation', st.salutation,
        'first_name', st.first_name,
        'middle_name', st.middle_name,
        'last_name', st.last_name,
        'email', case
          when st.email is null or position('@' in st.email) = 0 then st.email
          else left(split_part(st.email, '@', 1), 2) || '***@' || split_part(st.email, '@', 2)
        end,
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
        'grade', r.grade
      ) as row_json
    from am_academic_records r
    join am_students st on st.id = r.student_id
    left join am_institutions i on i.id = r.institution_id
    left join am_academic_years ay on ay.id = r.academic_year_id
    left join am_standards sd on sd.id = r.standard_id
    left join am_courses cr on cr.id = r.course_id
    left join am_streams strm on strm.id = r.stream_id
    where r.org_id = p_org_id
      and r.academic_year_id = p_year_id
      and st.contact_no is not null
      and trim(st.contact_no) = trim(p_contact_no)
      and exists (
        select 1 from am_public_submissions s
        where s.academic_record_id = r.id and s.org_id = p_org_id and s.status = 'approved'
      )
  ) t;

  return v_result;
end;
$$;

revoke all on function am_confirm_lookup_by_mobile(uuid, uuid, text, text) from public;
grant execute on function am_confirm_lookup_by_mobile(uuid, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- submit
-- Re-verifies that this record really belongs to that year + mobile number
-- rather than trusting the page already did.
create or replace function am_submit_data_confirmation(
  p_org_id uuid, p_year_id uuid, p_academic_record_id uuid, p_contact_no text, p_note text, p_has_changes boolean
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reference_code text;
  v_id uuid;
begin
  select s.reference_code into v_reference_code
  from am_academic_records r
  join am_students st on st.id = r.student_id
  join am_public_submissions s on s.academic_record_id = r.id and s.org_id = p_org_id and s.status = 'approved'
  where r.id = p_academic_record_id
    and r.org_id = p_org_id
    and r.academic_year_id = p_year_id
    and st.contact_no is not null
    and trim(st.contact_no) = trim(p_contact_no)
  order by s.created_at
  limit 1;

  if v_reference_code is null then
    raise exception 'We could not verify your details — check your mobile number';
  end if;

  insert into am_data_confirmations (org_id, academic_record_id, reference_code, contact_no, has_changes, note)
  values (
    p_org_id, p_academic_record_id, v_reference_code, trim(p_contact_no),
    p_has_changes, nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function am_submit_data_confirmation(uuid, uuid, uuid, text, text, boolean) from public;
grant execute on function am_submit_data_confirmation(uuid, uuid, uuid, text, text, boolean) to anon, authenticated;
