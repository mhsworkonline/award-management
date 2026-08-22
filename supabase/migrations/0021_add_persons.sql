-- Award Management — introduce am_persons
--
-- am_persons is the shared identity anchor: the record that will eventually
-- be referenced by both the Award domain (am_students) and the future
-- Community module (families, relationships, etc.). It holds only pure
-- identity fields — nothing institution-, year-, or award-specific.
--
-- For now, Award is the only consumer, so am_students still owns its
-- identity columns and a trigger keeps am_persons in sync automatically.
-- This means NO application code changes are required by this migration —
-- every insert/update to am_students transparently maintains a mirrored
-- am_persons row. When the Community module starts, am_persons becomes the
-- direct write target, am_students' duplicate identity columns are dropped,
-- and this sync trigger is retired. See lib/tables.ts for the physical name
-- mapping (T.persons).

create table am_persons (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references am_organizations(id) on delete cascade,
  salutation  text,
  first_name  text not null,
  middle_name text,   -- father's/husband's first name, by convention
  last_name   text not null,
  email       text,
  contact_no  text,
  photo_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- same duplicate-detection and name-search indexes am_students already has,
-- since both concerns belong with identity, not with the student role
create index am_persons_dupe_key on am_persons (
  org_id,
  lower(regexp_replace(first_name, '\s+', ' ', 'g')),
  lower(coalesce(regexp_replace(middle_name, '\s+', ' ', 'g'), '')),
  lower(regexp_replace(last_name, '\s+', ' ', 'g'))
);
create index am_persons_name_trgm on am_persons using gin (
  (coalesce(first_name, '') || ' ' || coalesce(middle_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops
);

alter table am_persons enable row level security;
create policy am_persons_authenticated_all on am_persons for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------- link + backfill
alter table am_students add column person_id uuid references am_persons(id) on delete restrict;

do $$
declare
  r record;
  new_person_id uuid;
begin
  for r in select * from am_students loop
    insert into am_persons (org_id, salutation, first_name, middle_name, last_name, email, contact_no, photo_path, created_at, updated_at)
    values (r.org_id, r.salutation, r.first_name, r.middle_name, r.last_name, r.email, r.contact_no, r.photo_path, r.created_at, r.updated_at)
    returning id into new_person_id;

    update am_students set person_id = new_person_id where id = r.id;
  end loop;
end $$;

alter table am_students alter column person_id set not null;
alter table am_students add constraint am_students_person_id_key unique (person_id);

-- ---------------------------------------------------------------- sync triggers
-- Keeps am_persons mirrored to am_students' identity columns. Runs as the
-- calling role (not security definer), so it relies on am_persons_authenticated_all
-- to permit the write — every current write path into am_students is staff
-- (authenticated), never anon, so this holds.
create or replace function am_tg_sync_student_person() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    insert into am_persons (org_id, salutation, first_name, middle_name, last_name, email, contact_no, photo_path, created_at, updated_at)
    values (new.org_id, new.salutation, new.first_name, new.middle_name, new.last_name, new.email, new.contact_no, new.photo_path, now(), now())
    returning id into new.person_id;
  elsif TG_OP = 'UPDATE' then
    update am_persons set
      org_id      = new.org_id,
      salutation  = new.salutation,
      first_name  = new.first_name,
      middle_name = new.middle_name,
      last_name   = new.last_name,
      email       = new.email,
      contact_no  = new.contact_no,
      photo_path  = new.photo_path,
      updated_at  = now()
    where id = new.person_id;
  end if;
  return new;
end $$;

create trigger am_students_sync_person
before insert or update on am_students
for each row execute function am_tg_sync_student_person();

-- a student's person record has no other purpose yet, so remove it when the
-- student is deleted rather than leaving an orphan behind
create or replace function am_tg_delete_student_person() returns trigger
language plpgsql as $$
begin
  delete from am_persons where id = old.person_id;
  return old;
end $$;

create trigger am_students_delete_person
after delete on am_students
for each row execute function am_tg_delete_student_person();
