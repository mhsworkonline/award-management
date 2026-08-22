-- Award Management — combine the 8-round-trip getLookups() into one RPC.
--
-- Mirrors the pattern am_public_form_options() already uses for the public
-- /apply form, just for the authenticated side. SECURITY INVOKER (the
-- default — no clause needed) is deliberate: this must run with the calling
-- user's own privileges so each table's existing RLS still applies exactly
-- as it did when these were 8 separate `.from(table).select()` calls. A
-- SECURITY DEFINER version would leak every lookup table to every role
-- regardless of their actual module permissions — not an option here.
create or replace function am_get_lookups(p_org_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'academicYears', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.label desc)
      from am_academic_years t where t.org_id = p_org_id
    ), '[]'::jsonb),
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
    'awardCategories', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order)
      from am_award_categories t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'giftItems', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from am_gift_items t where t.org_id = p_org_id
    ), '[]'::jsonb),
    'institutions', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', id, 'name', name, 'type', type, 'board_id', board_id, 'medium_id', medium_id)
        order by name
      )
      from am_institutions where org_id = p_org_id
    ), '[]'::jsonb)
  );
$$;
