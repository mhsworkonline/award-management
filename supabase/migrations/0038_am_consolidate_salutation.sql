-- "Ms." and "Miss" were both offered as salutation options, causing confusion
-- for the same person depending on who entered the record. Standardizing on
-- "Miss" (see lib/validators.ts SALUTATION_VALUES for the rationale) — this
-- is a one-time data cleanup for rows entered before that consolidation.
--
-- salutation is a plain `text` column on both tables (no enum constraint —
-- see 0010_am_add_salutation.sql), so this is a straight data update, not a
-- schema change. am_students' update fires am_tg_sync_student_person (see
-- 0021_add_persons.sql), so am_persons picks up the same change automatically
-- — no separate statement needed for it.

update am_students set salutation = 'Miss' where salutation = 'Ms.';
update am_public_submissions set salutation = 'Miss' where salutation = 'Ms.';
