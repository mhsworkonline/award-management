-- Confirmations becomes its own permission module (its own row in the role
-- permission matrix) instead of piggybacking on Submissions, as 0040 did.
-- Split from 0048 because a newly added enum value can't be used until the
-- transaction that added it has committed.
alter type am_module add value if not exists 'confirmations';
