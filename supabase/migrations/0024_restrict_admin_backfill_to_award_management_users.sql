-- Award Management — correct an over-broad backfill from migration 0022
--
-- 0022's cutover backfill assigned every auth.users row to the Administrator
-- role, reasoning "so nobody loses access." That reasoning assumed every
-- auth.users row belonged to this app — wrong, since auth.users is shared
-- instance-wide across every app in this Supabase project, not scoped per
-- app. It granted full Award Management admin rights to unrelated users
-- (bug-tracker and another app's accounts) that happened to already exist in
-- the same auth instance at migration time.
--
-- This corrects it: only the real Award Management account keeps
-- Administrator; every other pre-existing user is stripped back to no role
-- and is_admin = false (the same safe default am_auth_users_create_profile
-- already gives every *new* signup across the shared project going forward).
update am_profiles
set role_id = null, is_admin = false
where email <> 'admin@awardmanagement.com';
