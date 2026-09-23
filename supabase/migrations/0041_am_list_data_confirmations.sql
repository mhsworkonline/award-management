-- Staff-facing /confirmations list needs the student/institution/standard
-- *names* attached to each confirmation row, but those live on tables gated
-- by their own module's read permission (Students, Institutions, Settings),
-- not Submissions — same problem am_list_submissions (0035) already solved
-- for the Submissions page, solved the same way here.
create or replace function am_list_data_confirmations(p_org_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_json), '[]'::jsonb)
  from (
    select to_jsonb(c.*)
      || jsonb_build_object(
        'academic_records', case when r.id is not null then jsonb_build_object(
          'id', r.id,
          'period_no', r.period_no,
          'students', case when st.id is not null
            then jsonb_build_object('first_name', st.first_name, 'middle_name', st.middle_name, 'last_name', st.last_name) end,
          'institutions', case when i.id is not null then jsonb_build_object('name', i.name) end,
          'academic_years', case when ay.id is not null then jsonb_build_object('label', ay.label) end,
          'standards', case when sd.id is not null then jsonb_build_object('label', sd.label) end,
          'streams', case when sr.id is not null then jsonb_build_object('name', sr.name) end,
          'courses', case when co.id is not null then jsonb_build_object('name', co.name, 'structure_type', co.structure_type) end
        ) end
      ) as row_json
    from am_data_confirmations c
    left join am_academic_records r on r.id = c.academic_record_id
    left join am_students st on st.id = r.student_id
    left join am_institutions i on i.id = r.institution_id
    left join am_academic_years ay on ay.id = r.academic_year_id
    left join am_standards sd on sd.id = r.standard_id
    left join am_streams sr on sr.id = r.stream_id
    left join am_courses co on co.id = r.course_id
    where c.org_id = p_org_id
      and am_has_permission('submissions'::am_module, 'read')
    order by c.created_at desc
    limit 1000
  ) rows_cte;
$$;

revoke all on function am_list_data_confirmations(uuid) from public;
grant execute on function am_list_data_confirmations(uuid) to authenticated;
