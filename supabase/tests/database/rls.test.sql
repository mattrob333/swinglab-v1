-- RLS tests for SwingLab 2026. Run with: npx supabase test db
-- Two users: A (admin, the parent) and B (non-admin, the son), plus anon.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email, instance_id, aud, role)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dad@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'kid@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

select is((select count(*)::int from public.profiles
            where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002')),
          2, 'signup trigger created a profile per user');

update public.profiles set is_admin = true where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into public.clips (id, owner_id, kind, title, storage_path) values
  ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'pro', 'Pro swing',
   'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000001.mp4'),
  ('22222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'athlete', 'Kid swing',
   'bbbbbbbb-0000-4000-8000-000000000002/22222222-0000-4000-8000-000000000002.mp4');
insert into public.snapshots (id, owner_id, note) values
  ('33333333-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'kid snap');
insert into storage.objects (bucket_id, name, owner_id) values
  ('clips', 'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000001.mp4', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('clips', 'bbbbbbbb-0000-4000-8000-000000000002/22222222-0000-4000-8000-000000000002.mp4', 'bbbbbbbb-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------- structure
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.profiles'::regclass, 'public.clips'::regclass, 'public.snapshots'::regclass)),
          'RLS enabled on every public table');
select ok((select bool_and(not public) from storage.buckets where id in ('clips', 'snapshots')),
          'clips and snapshots buckets are private');
select is((select file_size_limit from storage.buckets where id = 'clips'), 209715200::bigint,
          'clips bucket limited to 200 MB');
select ok(not exists (
            select 1 from pg_tables t where t.schemaname = 'public' and not t.rowsecurity),
          'no public table without RLS');

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select count(*) from public.clips', '42501', null, 'anon has no privilege on clips');
select throws_ok('select count(*) from public.snapshots', '42501', null, 'anon has no privilege on snapshots');
select throws_ok('select count(*) from public.profiles', '42501', null, 'anon has no privilege on profiles');
select is((select count(*)::int from storage.objects), 0, 'anon sees no storage objects');
select throws_ok(
  $$insert into public.clips (id, owner_id, kind) values (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000002', 'athlete')$$,
  '42501', null, 'anon cannot insert clips');

reset role;

-- ---------------------------------------------------------------- user B (non-admin)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from public.clips where kind = 'pro'), 1, 'B can read pro clips');
select is((select count(*)::int from public.clips where kind = 'athlete'), 1, 'B reads own athlete clip');
select ok(not public.is_admin(), 'B is not admin');

select throws_ok(
  $$insert into public.clips (id, owner_id, kind, title) values
    ('44444444-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'pro', 'fake pro')$$,
  '42501', null, 'non-admin cannot insert a pro clip');

select lives_ok(
  $$insert into public.clips (id, owner_id, kind, title) values
    ('55555555-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000002', 'athlete', 'new swing')$$,
  'B can insert own athlete clip');

select throws_ok(
  $$insert into public.clips (id, owner_id, kind, title) values
    ('66666666-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000001', 'athlete', 'spoofed owner')$$,
  '42501', null, 'B cannot insert a clip owned by A');

select throws_ok(
  $$update public.clips set kind = 'pro' where id = '55555555-0000-4000-8000-000000000005'$$,
  '42501', null, 'B cannot promote own clip to pro');

-- Updates on rows the policy hides silently affect 0 rows.
update public.clips set title = 'hacked' where id = '11111111-0000-4000-8000-000000000001';
select is((select title from public.clips where id = '11111111-0000-4000-8000-000000000001'), 'Pro swing',
          'B cannot modify pro clip');
delete from public.clips where id = '11111111-0000-4000-8000-000000000001';
select is((select count(*)::int from public.clips where id = '11111111-0000-4000-8000-000000000001'), 1,
          'B cannot delete pro clip');

select throws_ok(
  $$update public.profiles set is_admin = true where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  '42501', null, 'B cannot make self admin');
select lives_ok(
  $$update public.profiles set default_handedness = 'L' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  'B can change own handedness');

select throws_ok(
  $$insert into public.clips (id, owner_id, kind, storage_path) values
    ('77777777-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000002', 'athlete',
     'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000001.mp4')$$,
  '23514', null, 'row cannot point at another user''s storage object');

-- storage as B
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
    ('clips', 'aaaaaaaa-0000-4000-8000-000000000001/99999999-0000-4000-8000-000000000009.mp4', 'bbbbbbbb-0000-4000-8000-000000000002')$$,
  '42501', null, 'B cannot upload into A''s folder');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
    ('clips', 'bbbbbbbb-0000-4000-8000-000000000002/55555555-0000-4000-8000-000000000005.mp4', 'bbbbbbbb-0000-4000-8000-000000000002')$$,
  'B can upload into own folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
    ('clips', 'bbbbbbbb-0000-4000-8000-000000000002/../evil.html', 'bbbbbbbb-0000-4000-8000-000000000002')$$,
  '42501', null, 'object names must match {uid}/{uuid}.{ext}');
-- (Direct SQL deletes on storage.objects are blocked by Supabase; the HTTP test covers deletes.)
update storage.objects set name = 'bbbbbbbb-0000-4000-8000-000000000002/stolen.mp4' where name like 'aaaaaaaa-%';
select is((select count(*)::int from storage.objects where name like 'aaaaaaaa-%'), 1,
          'B cannot rename A''s objects');

reset role;

-- ---------------------------------------------------------------- user A (admin)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select ok(public.is_admin(), 'A is admin');
select lives_ok(
  $$insert into public.clips (id, owner_id, kind, title) values
    ('88888888-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000001', 'pro', 'New pro')$$,
  'admin can insert pro clip');
select is((select count(*)::int from public.snapshots), 1, 'household: A can read B''s snapshot');
select is((select count(*)::int from public.clips where owner_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 2,
          'household: A can read B''s athlete clips');

update public.clips set title = 'dad edit' where id = '22222222-0000-4000-8000-000000000002';
update public.snapshots set note = 'dad edit' where id = '33333333-0000-4000-8000-000000000003';
delete from public.snapshots where id = '33333333-0000-4000-8000-000000000003';
reset role;
select is((select title from public.clips where id = '22222222-0000-4000-8000-000000000002'), 'Kid swing',
          'A (even as admin) cannot modify B''s athlete clip');
select is((select note from public.snapshots where id = '33333333-0000-4000-8000-000000000003'), 'kid snap',
          'A cannot modify or delete B''s snapshot');

select ok(
  (select server_updated_at from public.clips where id = '88888888-0000-4000-8000-000000000008') is not null,
  'server_updated_at stamped');

select * from finish();
rollback;
