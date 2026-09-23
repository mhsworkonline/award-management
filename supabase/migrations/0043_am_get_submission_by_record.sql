-- Clicking a row on /confirmations should open the *exact* Review
-- Application sheet /submissions already uses — not a separate detail/edit
-- view — since a confirmation always traces back to the approved
-- submission that created the student/academic record in the first place,
-- and that sheet already knows how to edit an approved submission (pushing
-- the correction into the linked student/academic record to keep them in
-- sync — see lib/actions/submissions.ts updateSubmission).
--
-- Mirrors am_list_submissions (0035) exactly — same joins, same shape, same
-- Submissions:Read gate — just narrowed to the one row for a given
-- academic_record_id instead of a status-filtered list. There is at most
-- one: academic_record_id is only ever set once, at approval.
create or replace function am_get_submission_by_record(p_org_id uuid, p_academic_record_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
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
    )
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
    and s.academic_record_id = p_academic_record_id
    and am_has_permission('submissions'::am_module, 'read')
  limit 1;
$$;

revoke all on function am_get_submission_by_record(uuid, uuid) from public;
grant execute on function am_get_submission_by_record(uuid, uuid) to authenticated;
