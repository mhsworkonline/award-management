-- Award Management — profile email sync
--
-- am_profiles.email is a denormalized copy of auth.users.email, kept in sync
-- by triggers on auth.users. Reasoning: listing users for the "Users & Roles"
-- admin UI would otherwise require the service-role Admin API on every page
-- load just to resolve emails — with this, the normal authenticated client
-- can list users directly (RLS already restricts that to admins).
--
-- Also: every new auth.users row gets a bare am_profiles row automatically
-- (role_id null, is_admin false — no access until an admin assigns a role).
-- This means the "create user" server action only ever needs to UPDATE a
-- profile, never INSERT one, and a user always has a profile row to read.

alter table am_profiles add column if not exists email text;
update am_profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function am_tg_create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into am_profiles (id, org_id, email)
  values (new.id, '00000000-0000-0000-0000-000000000001', new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger am_auth_users_create_profile
after insert on auth.users
for each row execute function am_tg_create_profile_for_new_user();

create or replace function am_tg_sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update am_profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end $$;

create trigger am_auth_users_sync_email
after update on auth.users
for each row execute function am_tg_sync_profile_email();
