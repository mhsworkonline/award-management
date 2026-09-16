-- Adds a "doubtful" outcome alongside pending/approved/rejected (processed,
-- but staff aren't confident about the student), and generalizes the
-- reject-only reason field into a review note every decision now requires.
--
-- Note: ALTER TYPE ... ADD VALUE can't be used in the same transaction that
-- reads/writes rows with the new value — this migration only adds it, no
-- backfill needed since no "doubtful" rows exist yet.
alter type am_submission_status add value 'doubtful';

alter table am_public_submissions rename column rejection_reason to review_note;
