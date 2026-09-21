-- The Submissions review sheet needs option lists for its dropdowns
-- (institution, board, medium, standard, stream, course) — to show the
-- current value and, for roles allowed to edit, to pick a different one.
-- am_get_lookups is SECURITY INVOKER on purpose (see 0026), so a role scoped
-- to Submissions only gets empty arrays for anything gated behind the
-- Institutions/Settings modules: the dropdowns render blank even though the
-- table behind them (via am_list_submissions, 0035) shows the names fine.
--
-- This is the same narrow pattern as am_list_submissions: SECURITY DEFINER,
-- but gated on Submissions:Read and returning ONLY these six reference
-- lists — not gift items, award categories, academic years, or institution
-- contact details, which am_get_lookups would expose. It's reference data
-- (school/board/course names), and a reviewer inherently needs to see it to
-- review or edit an application at all.
create or replace function am_get_submission_lookups(p_org_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when am_has_permission('submissions'::am_module, 'read') then
    jsonb_build_object(
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
      'streams', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.name)
        from am_streams t where t.org_id = p_org_id
      ), '[]'::jsonb),
      'institutions', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', id, 'name', name, 'type', type, 'board_id', board_id, 'medium_id', medium_id)
          order by name
        )
        from am_institutions where org_id = p_org_id
      ), '[]'::jsonb)
    )
  else '{}'::jsonb end;
$$;

revoke all on function am_get_submission_lookups(uuid) from public;
grant execute on function am_get_submission_lookups(uuid) to authenticated;
