-- Award Management — Play Group and Nursery, below LKG/UKG.
--
-- Same pattern 0002 used to introduce LKG/UKG below Std 1: widen the level
-- constraint, then seed the new rows. Widened well past what's needed today
-- (-10, not -3) so more pre-primary tiers can be added later purely through
-- Settings -> Standards (already a full add/edit/delete UI — see
-- config-section.tsx) without another migration. Numbering convention:
-- negative = before Std 1, lower number = earlier grade, 0 intentionally
-- skipped (reads oddly in sort). Today's full ladder:
--   -4 = Play Group, -3 = Nursery, -2 = LKG, -1 = UKG, 1..12 = Std 1..12

alter table am_standards drop constraint if exists am_standards_level_check;
alter table am_standards add constraint am_standards_level_check check (level between -10 and 12);

insert into am_standards (org_id, level, label) values
  ('00000000-0000-0000-0000-000000000001', -4, 'Play Group'),
  ('00000000-0000-0000-0000-000000000001', -3, 'Nursery')
on conflict (org_id, level) do nothing;
