-- Expands the college course catalog for the public application form,
-- based on degree names actually seen in student submissions.
--
-- Safe to re-run: the two edits below are idempotent, the BE/BTech
-- retirement is guarded against orphaning existing student records, and
-- the inserts upsert on the table's existing (org_id, name) unique key.

begin;

do $$
declare
  v_org_id      uuid := '00000000-0000-0000-0000-000000000001';
  v_course_name text;
  v_course_id   uuid;
  v_tbl         text;
  v_hit         boolean;
  v_referenced  boolean;
begin

  -- 1) MBA: this org's programs run 2 years/year-based ("Final Year" = Year 2),
  --    not the previously-seeded semester structure.
  update am_courses
  set structure_type = 'year', total_periods = 2
  where org_id = v_org_id and name = 'MBA';

  -- 2) Retire the generic "BE" and "BTech" entries now that specific branches
  --    are being added below (Mechanical, Civil, Electronics, Computer,
  --    Environmental, Computer Science & Engineering). Guarded: a course is
  --    only deleted if no student/academic-record/submission still points at
  --    it — the column is ON DELETE SET NULL, so an unguarded delete would
  --    silently blank out those students' course instead of failing loudly.
  --    Checks information_schema first rather than assuming course_id exists
  --    on every one of these tables, since that assumption didn't hold here.
  foreach v_course_name in array array['BE', 'BTech'] loop
    select id into v_course_id from am_courses where org_id = v_org_id and name = v_course_name;
    if v_course_id is null then
      continue; -- already retired, or never existed
    end if;

    v_referenced := false;
    foreach v_tbl in array array['am_students', 'am_academic_records', 'am_public_submissions'] loop
      if exists (
        select 1 from information_schema.columns
        where table_name = v_tbl and column_name = 'course_id'
      ) then
        execute format('select exists (select 1 from %I where course_id = $1)', v_tbl)
          into v_hit using v_course_id;
        v_referenced := v_referenced or v_hit;
      end if;
    end loop;

    if v_referenced then
      raise notice 'Skipped deleting "%" — still referenced by existing records. Reassign those first, then re-run.', v_course_name;
    else
      delete from am_courses where id = v_course_id;
    end if;
  end loop;

end $$;

-- 3) New degree entries — one row per degree; the application form generates
--    the "Year 1 / Year 2 / ..." (or "Semester 1 / 2 / ...") picker from
--    total_periods on its own, so years are not separate rows.
insert into am_courses (org_id, name, structure_type, total_periods) values
  ('00000000-0000-0000-0000-000000000001', 'B.A. (Psychology)',                          'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'B.Sc. in Management',                        'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'Computer Science & Engineering',             'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'B.Tech. (Mechanical Engineering)',           'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'B.Sc. IT',                                   'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'BDS',                                        'year', 5),
  ('00000000-0000-0000-0000-000000000001', 'M.A. in Archaeology & Ancient History',      'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'Master in Civil Engineering',                'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'M.Sc. IT',                                   'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'BBA',                                        'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'BCA',                                        'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'Bachelor of Physical Education & Sports',    'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'B.E. Environmental Engineering',             'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'B.Pharm',                                    'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'B.Sc. (Mathematics)',                        'year', 3),
  ('00000000-0000-0000-0000-000000000001', 'B.Tech. (Computer Engineering)',             'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'B.E. Civil Engineering',                     'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'B.E. Electronics',                           'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'Bachelor of Physiotherapy',                  'year', 4),
  ('00000000-0000-0000-0000-000000000001', 'Master of Technology (Computer Engineering)', 'year', 3),
  -- Single-stage professional/entrance tracks — Total periods is 1 since
  -- there's no advancing "year" concept; the year picker will just show one option.
  ('00000000-0000-0000-0000-000000000001', 'CA Foundation',                              'year', 1),
  ('00000000-0000-0000-0000-000000000001', 'CA Intermediate — Group I',                  'year', 1),
  ('00000000-0000-0000-0000-000000000001', 'CA Intermediate — Group II',                 'year', 1),
  ('00000000-0000-0000-0000-000000000001', 'CMA Foundation',                             'year', 1),
  ('00000000-0000-0000-0000-000000000001', 'NEET Foundation',                            'year', 1)
on conflict (org_id, name) do update
  set structure_type = excluded.structure_type,
      total_periods  = excluded.total_periods;

commit;
