-- Performance pass on the Submissions review flow — approving felt slow and
-- the table was slow to catch up afterward. Three independent fixes:

-- ---------------------------------------------------------------- 1. missing index
-- am_list_submissions (0035) joins each submission's attachments via a
-- correlated subquery (`where a.submission_id = s.id`) run once per row —
-- up to 500 times per page load/refresh. am_submission_attachments had no
-- index on submission_id at all, so every one of those was a full table
-- scan. This is the single most-run query in the whole module (every page
-- load, every router.refresh() after an action).
create index if not exists am_submission_attachments_submission_idx
  on am_submission_attachments (submission_id);

-- ---------------------------------------------------------------- 2. find-or-create scan
-- approveSubmission() used to find-or-create the persistent student by exact
-- normalized-name match by pulling EVERY student in the org (paginated 1000
-- at a time) into memory and comparing in JS — on every single approval,
-- scaling worse as the roster grows. am_students already has a purpose-built
-- expression index for exactly this normalization (am_students_dupe_key,
-- see 0021/0025) that the old code never used. This does the same lookup —
-- same normalization, same "first name + middle name (if both given) + last
-- name" match — as one indexed query instead.
--
-- Not SECURITY DEFINER: it's only ever called from approveSubmission()'s
-- already-elevated admin/service-role client (same as the full scan it
-- replaces), so it doesn't need to escalate privileges itself. Locked to
-- that caller by revoking PUBLIC and granting nothing further — service_role
-- has inherent access regardless of explicit grants.
create or replace function am_find_student_by_name(
  p_org_id uuid, p_first_name text, p_middle_name text, p_last_name text
)
returns table (
  id uuid, salutation text, first_name text, middle_name text, last_name text,
  lanedaar_name text, email text, photo_path text
)
language sql stable set search_path = public as $$
  select s.id, s.salutation, s.first_name, s.middle_name, s.last_name,
         s.lanedaar_name, s.email, s.photo_path
  from am_students s
  where s.org_id = p_org_id
    and lower(regexp_replace(s.first_name, '\s+', ' ', 'g'))
      = lower(regexp_replace(p_first_name, '\s+', ' ', 'g'))
    and lower(coalesce(regexp_replace(s.middle_name, '\s+', ' ', 'g'), ''))
      = lower(coalesce(regexp_replace(p_middle_name, '\s+', ' ', 'g'), ''))
    and lower(regexp_replace(s.last_name, '\s+', ' ', 'g'))
      = lower(regexp_replace(p_last_name, '\s+', ' ', 'g'))
  limit 1;
$$;

revoke all on function am_find_student_by_name(uuid, text, text, text) from public;

-- ---------------------------------------------------------------- 3. status counts
-- getSubmissionCounts() (the tab-header counts) ran 5 separate head-only
-- count queries — already parallelized client-side via Promise.all, but
-- still 5 separate requests/connections. One aggregate query gets the same
-- 5 numbers in a single round trip. SECURITY INVOKER (the default) on
-- purpose — it must keep respecting RLS exactly like the 5 queries it
-- replaces did, so a role without Submissions:Read still gets zeros, not a
-- privilege escalation.
create or replace function am_submission_counts(p_org_id uuid)
returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'pending',  count(*) filter (where status = 'pending'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'doubtful', count(*) filter (where status = 'doubtful'),
    'all',      count(*)
  )
  from am_public_submissions
  where org_id = p_org_id;
$$;

revoke all on function am_submission_counts(uuid) from public;
grant execute on function am_submission_counts(uuid) to authenticated;
