-- Reconciled from supabase_migrations.schema_migrations (version 20260820092019).

alter table am_students add column if not exists salutation text;
alter table am_public_submissions add column if not exists salutation text;
