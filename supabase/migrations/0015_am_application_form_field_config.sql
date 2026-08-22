-- Reconciled from supabase_migrations.schema_migrations (version 20260820110913).

alter table am_application_forms add column if not exists field_config jsonb not null default '{
  "show_salutation": true,
  "show_middle_name": true,
  "show_contact_no": true,
  "show_roll_no": false,
  "show_notes": true,
  "show_attachments": true
}'::jsonb;

create or replace function am_resolve_application_form(p_org_id uuid, p_slug text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when f.id is null then null else jsonb_build_object(
    'id', f.id, 'slug', f.slug, 'title', f.title, 'description', f.description,
    'is_enabled', f.is_enabled, 'fieldConfig', f.field_config,
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

-- Restore the test value written during diagnosis back to unset.
update am_application_forms set description = null where description = 'TEST DESCRIPTION 123';
