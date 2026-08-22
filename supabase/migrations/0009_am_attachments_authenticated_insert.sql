-- Reconciled from supabase_migrations.schema_migrations (version 20260820090714).

create policy am_attachments_authenticated_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'am-submission-attachments');
