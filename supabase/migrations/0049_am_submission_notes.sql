-- Award Management — running follow-up notes on a public submission.
--
-- Separate from am_public_submissions.review_note, which holds only the reason
-- for the *latest* decision and is overwritten by the next one. These are an
-- append-only log: reviewers jot down each follow-up (called the parent,
-- waiting on a marksheet, ...) as it happens, before, during or after a
-- decision, and every entry stays. No update/delete policies on purpose —
-- a note, once written, can't be edited or removed through the API.
--
-- Read follows Submissions: Read, writing follows Submissions: Update (the
-- same bar as reviewing), and notes disappear with their submission.

create table am_submission_notes (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references am_organizations(id) on delete cascade,
  submission_id uuid not null references am_public_submissions(id) on delete cascade,
  note          text not null check (length(btrim(note)) > 0 and length(note) <= 2000),
  created_by    text,
  created_at    timestamptz not null default now()
);
create index am_submission_notes_submission_idx on am_submission_notes (submission_id, created_at);

alter table am_submission_notes enable row level security;

create policy am_submission_notes_select on am_submission_notes
  for select to authenticated using (am_has_permission('submissions'::am_module, 'read'));
create policy am_submission_notes_insert on am_submission_notes
  for insert to authenticated with check (am_has_permission('submissions'::am_module, 'update'));
