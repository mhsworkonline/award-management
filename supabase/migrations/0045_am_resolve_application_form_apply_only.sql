-- /apply (and /apply/[slug]) must only ever resolve Apply-type forms. Since
-- 0042 added Confirm-type forms to the same table, an enabled Confirm form
-- newer than the Apply form could have been picked for the plain /apply link.
-- am_resolve_confirm_form already filters its own side the same way.

create or replace function public.am_resolve_application_form(p_org_id uuid, p_slug text default null)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when f.id is null then null else jsonb_build_object(
    'id', f.id, 'slug', f.slug, 'title', f.title, 'titleGu', f.title_gu,
    'description', f.description, 'descriptionGu', f.description_gu,
    'is_enabled', f.is_enabled, 'fieldConfig', f.field_config,
    'academicYear', jsonb_build_object('id', y.id, 'label', y.label)
  ) end
  from (
    select * from am_application_forms
    where org_id = p_org_id
      and form_type = 'apply'
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
$function$;
