-- Deleting a stored file must need the same Delete permission as deleting
-- the thing it belongs to.
--
-- Until now all three buckets let ANY signed-in user delete any object:
--   am-submission-attachments  -> am_attachments_authenticated_delete (using: bucket only)
--   am-student-photos          -> am_photos_authenticated_all         (for all, bucket only)
--   am-branding                -> am_branding_authenticated_all       (for all, bucket only)
-- Table RLS didn't help: a blocked row delete silently removes zero rows (no
-- error), and Storage objects are governed only by these policies. So a role
-- with no Delete grant could still remove a marksheet, photo or logo file.
--
-- Read/insert/update behave exactly as before; only DELETE now goes through
-- am_has_permission, the same check the tables use (admins pass it too).
-- Schema-qualified because storage policies don't share our search_path.

-- ---------------------------------------------------------------- attachments
drop policy if exists am_attachments_authenticated_delete on storage.objects;
create policy am_attachments_authenticated_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'am-submission-attachments'
    and public.am_has_permission('submissions'::public.am_module, 'delete')
  );

-- ---------------------------------------------------------------- student photos
-- "for all" can't have one command carved out, so split it.
drop policy if exists am_photos_authenticated_all on storage.objects;
create policy am_photos_authenticated_select on storage.objects
  for select to authenticated using (bucket_id = 'am-student-photos');
create policy am_photos_authenticated_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'am-student-photos');
create policy am_photos_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'am-student-photos') with check (bucket_id = 'am-student-photos');
create policy am_photos_authenticated_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'am-student-photos'
    and public.am_has_permission('students'::public.am_module, 'delete')
  );

-- ---------------------------------------------------------------- branding logo
drop policy if exists am_branding_authenticated_all on storage.objects;
create policy am_branding_authenticated_select on storage.objects
  for select to authenticated using (bucket_id = 'am-branding');
create policy am_branding_authenticated_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'am-branding');
create policy am_branding_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'am-branding') with check (bucket_id = 'am-branding');
create policy am_branding_authenticated_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'am-branding'
    and public.am_has_permission('settings'::public.am_module, 'delete')
  );
