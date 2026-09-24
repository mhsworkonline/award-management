-- Moves everything under /confirmations from the Submissions permission to
-- the new 'confirmations' module (0047), and gives every existing role a
-- Confirmations row copied from its Submissions row so nobody gains or loses
-- access the moment this lands — an admin can then diverge them per role.

-- The protect trigger blocks permission changes on the Administrator role;
-- switched off just for this backfill, same as 0022's seed had to run before
-- the trigger existed.
alter table am_permissions disable trigger am_permissions_protect;

insert into am_permissions (role_id, module, can_create, can_read, can_update, can_delete)
select role_id, 'confirmations'::am_module, can_create, can_read, can_update, can_delete
from am_permissions
where module = 'submissions'::am_module
on conflict (role_id, module) do nothing;

alter table am_permissions enable trigger am_permissions_protect;

drop policy if exists am_data_confirmations_select on am_data_confirmations;
drop policy if exists am_data_confirmations_delete on am_data_confirmations;
create policy am_data_confirmations_select on am_data_confirmations
  for select to authenticated using (am_has_permission('confirmations'::am_module, 'read'));
create policy am_data_confirmations_delete on am_data_confirmations
  for delete to authenticated using (am_has_permission('confirmations'::am_module, 'delete'));

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
      and am_has_permission('confirmations'::am_module, 'read')
    order by c.created_at desc
    limit 1000
  ) rows_cte;
$$;

revoke all on function am_list_data_confirmations(uuid) from public;
grant execute on function am_list_data_confirmations(uuid) to authenticated;
