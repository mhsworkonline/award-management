-- Reconciled from supabase_migrations.schema_migrations (version 20260821061836).

-- Contact number is now a structural, always-required field (like email) —
-- no longer toggle-able per form. Strip it from existing rows' stored config
-- and from the column default for new forms.
update am_application_forms set field_config = field_config - 'show_contact_no';
alter table am_application_forms
  alter column field_config set default '{"show_notes": true, "show_roll_no": false, "show_salutation": true, "show_attachments": true, "show_middle_name": true}'::jsonb;
