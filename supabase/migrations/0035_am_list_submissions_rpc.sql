-- Submissions review needs to show the institution/standard/course/board/
-- medium/academic-year *names* attached to each application — but those
-- live on other tables, each gated by their own module's read permission
-- (Institutions, Settings), not Submissions. A role scoped to Submissions:
-- Read only could see every submission row fine, but every matched (not
-- free-typed) institution/standard/etc. rendered blank, because resolving
-- the join required permissions on tables that role was never granted.
--
-- This is narrow and safe (unlike a SECURITY DEFINER am_get_lookups would
-- be, see 0026's comment) — it only ever returns the specific handful of
-- names attached to submission rows the caller already has Submissions:Read
-- for, not an enumerable dump of every institution/standard in the org.
create or replace function am_list_submissions(p_org_id uuid, p_status text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_json), '[]'::jsonb)
  from (
    select to_jsonb(s.*)
      || jsonb_build_object(
        'institutions', case when i.id is not null
          then jsonb_build_object('id', i.id, 'name', i.name, 'type', i.type) end,
        'academic_years', case when ay.id is not null
          then jsonb_build_object('id', ay.id, 'label', ay.label) end,
        'standards', case when st.id is not null
          then jsonb_build_object('id', st.id, 'label', st.label) end,
        'streams', case when sr.id is not null
          then jsonb_build_object('id', sr.id, 'name', sr.name) end,
        'courses', case when c.id is not null
          then jsonb_build_object('id', c.id, 'name', c.name, 'structure_type', c.structure_type) end,
        'boards', case when b.id is not null
          then jsonb_build_object('id', b.id, 'name', b.name) end,
        'mediums', case when m.id is not null
          then jsonb_build_object('id', m.id, 'name', m.name) end,
        'application_forms', case when f.id is not null
          then jsonb_build_object('id', f.id, 'title', f.title, 'slug', f.slug) end,
        'attachments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id, 'submission_id', a.submission_id, 'file_path', a.file_path,
            'file_name', a.file_name, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes,
            'created_at', a.created_at
          ))
          from am_submission_attachments a
          where a.submission_id = s.id
        ), '[]'::jsonb)
      ) as row_json
    from am_public_submissions s
    left join am_institutions i on i.id = s.institution_id
    left join am_academic_years ay on ay.id = s.academic_year_id
    left join am_standards st on st.id = s.standard_id
    left join am_streams sr on sr.id = s.stream_id
    left join am_courses c on c.id = s.course_id
    left join am_boards b on b.id = s.board_id
    left join am_mediums m on m.id = s.medium_id
    left join am_application_forms f on f.id = s.form_id
    where s.org_id = p_org_id
      and am_has_permission('submissions'::am_module, 'read')
      and (p_status is null or s.status = p_status::am_submission_status)
    order by s.created_at desc
    limit 500
  ) rows_cte;
$$;

revoke all on function am_list_submissions(uuid, text) from public;
grant execute on function am_list_submissions(uuid, text) to authenticated;
