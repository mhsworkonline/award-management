-- Reconciled from supabase_migrations.schema_migrations (version 20260730133529).

-- College board affiliation belongs on am_institutions.board_id (already exists,
-- reused for both types), not on am_courses — courses are a separate global lookup.
alter table am_courses drop column if exists board_id;

insert into am_boards (org_id, name, applies_to) values
  ('00000000-0000-0000-0000-000000000001', 'Gujarat University', 'college'),
  ('00000000-0000-0000-0000-000000000001', 'Saurashtra University', 'college')
on conflict (org_id, name) do nothing;
