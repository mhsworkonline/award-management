-- Reconciled from supabase_migrations.schema_migrations (version 20260820101406).

alter table am_organizations add column if not exists app_name text not null default 'Award Application';
alter table am_organizations add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('am-branding', 'am-branding', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

create policy am_branding_authenticated_all on storage.objects for all to authenticated
  using (bucket_id = 'am-branding') with check (bucket_id = 'am-branding');

-- Anon/public read the logo through the bucket's public URL (bypasses RLS
-- entirely since the bucket is public) — no anon storage policy needed.

create or replace function am_public_branding(p_org_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object('app_name', app_name, 'logo_path', logo_path)
  from am_organizations where id = p_org_id;
$$;

revoke all on function am_public_branding(uuid) from public;
grant execute on function am_public_branding(uuid) to anon, authenticated;
