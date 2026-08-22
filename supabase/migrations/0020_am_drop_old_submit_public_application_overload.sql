-- Reconciled from supabase_migrations.schema_migrations (version 20260821062710).

-- `create or replace function` with an added parameter creates a *new*
-- overload rather than replacing the old one — Postgres keys function identity
-- on the parameter signature. Leaving the old 23-arg version in place would
-- still be callable by anon via PostgREST and would skip the new required
-- contact-number/photograph checks entirely, so it must be dropped explicitly.
drop function if exists public.am_submit_public_application(
  uuid, uuid, text, text, text, text, text, text, uuid, text, uuid, text, uuid, uuid, uuid, text, text,
  integer, text, numeric, text, text, text
);
