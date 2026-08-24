-- Award Management — track which am_profiles rows actually belong to this app
--
-- auth.users is shared instance-wide across every app on this Supabase
-- project (confirmed the hard way in 0024's backfill fix). The
-- am_auth_users_create_profile trigger (0023) auto-creates a bare am_profiles
-- row for *any* signup on the shared instance, not just Award Management's —
-- so bug-tracker and other apps' users all got a harmless row here too.
--
-- "Has a role" isn't a safe filter for the Users & Roles list: a
-- deliberately revoked Award Management user (role_id/is_admin cleared by
-- revokeUserAccess) would incorrectly disappear alongside the real noise.
-- Instead, `provisioned` marks a row as one this app's admin actually
-- created (set true in lib/actions/users.ts' createUser()) — independent of
-- whatever role it currently holds.
alter table am_profiles add column if not exists provisioned boolean not null default false;

-- Backfill: anyone who already has a role or admin status was clearly
-- provisioned through this app already (the trigger-created bare rows never
-- get either) — covers the pre-existing admin account plus anyone created
-- during testing before this column existed.
update am_profiles set provisioned = true where is_admin or role_id is not null;
