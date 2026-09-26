-- Award Management — let one student have more than one enrollment per year.
--
-- am_academic_records used to be unique on (student_id, academic_year_id), so a
-- student who applied twice in one year for *different* placements (say two
-- courses at two colleges, each with its own award) could never have the second
-- application approved: the insert hit the unique key and approval failed with
-- "A record with these details already exists".
--
-- Awards, gifts and distribution all hang off academic_record_id, so a second
-- enrollment is simply a second record with its own awards — nothing downstream
-- assumed one per year. What must still be impossible is the *same* enrollment
-- twice, so uniqueness now covers the whole placement. `nulls not distinct` so
-- a school record (course_id null) and a college record (standard_id null) still
-- collide with an identical twin instead of slipping past on the NULLs.

alter table am_academic_records
  drop constraint am_academic_records_student_id_academic_year_id_key;

create unique index am_academic_records_placement_key
  on am_academic_records (student_id, academic_year_id, institution_id, standard_id, course_id, period_no)
  nulls not distinct;
