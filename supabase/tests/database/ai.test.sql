-- RLS tests for the AI tables (analyses, ai_usage). Run with: npx supabase test db
-- Users: A (the parent) and B (the son), plus anon. They share a household, so
-- they read each other's analyses, but ai_usage stays owner-only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email, instance_id, aud, role)
values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'dad-ai@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'kid-ai@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.analyses (id, owner_id, snapshot_ids, model, model_id, status, result)
values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a',
   array['33333333-0000-4000-8000-000000000003']::uuid[], 'opus', 'claude-opus-5-5', 'done', '{"summary":"dad"}'),
  ('b1b1b1b1-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b',
   '{}', 'sol', 'gpt-6.1-sol', 'done', '{"summary":"kid"}');
insert into public.ai_usage (user_id, kind, model_id, input_tokens, output_tokens) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'analyze', 'claude-opus-5-5', 1000, 500),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'transcribe', 'gpt-4o-transcribe', 10, 20);

-- ---------------------------------------------------------------- structure
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.analyses'::regclass, 'public.ai_usage'::regclass)),
          'RLS enabled on analyses and ai_usage');
select ok(
  (select server_updated_at from public.analyses where id = 'a1a1a1a1-0000-4000-8000-000000000001') is not null,
  'analyses.server_updated_at stamped');
select throws_ok(
  $$insert into public.analyses (id, owner_id, model) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000a', 'gpt')$$,
  '23514', null, 'model must be opus or sol');
select throws_ok(
  $$insert into public.analyses (id, owner_id, model, status) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000a', 'opus', 'weird')$$,
  '23514', null, 'status is constrained');
select throws_ok(
  $$insert into public.analyses (id, owner_id, model, result) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000a', 'opus', '[1]')$$,
  '23514', null, 'result must be a JSON object');
select throws_ok(
  $$insert into public.ai_usage (user_id, kind) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'chat')$$,
  '23514', null, 'ai_usage.kind is constrained');

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select count(*) from public.analyses', '42501', null, 'anon cannot read analyses');
select throws_ok('select count(*) from public.ai_usage', '42501', null, 'anon cannot read ai_usage');
select throws_ok(
  $$insert into public.ai_usage (user_id, kind) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'analyze')$$,
  '42501', null, 'anon cannot insert ai_usage');

reset role;

-- ---------------------------------------------------------------- user B
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.analyses where id in
            ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001')), 2,
          'household: B reads own and A''s analyses');
select lives_ok(
  $$insert into public.analyses (id, owner_id, model, status) values
    ('b2b2b2b2-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000b', 'opus', 'pending')$$,
  'B can insert own analysis');
select throws_ok(
  $$insert into public.analyses (id, owner_id, model) values
    ('b3b3b3b3-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'opus')$$,
  '42501', null, 'B cannot insert an analysis owned by A');
select lives_ok(
  $$update public.analyses set drill_videos = '[{"title":"t","url":"https://www.youtube.com/watch?v=abcdefghijk","channel":"","why":""}]'
    where id = 'b1b1b1b1-0000-4000-8000-000000000001'$$,
  'B can update own analysis');
select throws_ok(
  $$update public.analyses set owner_id = 'aaaaaaaa-0000-4000-8000-00000000000a' where id = 'b1b1b1b1-0000-4000-8000-000000000001'$$,
  '42501', null, 'B cannot give an analysis to A');
update public.analyses set coach_notes = 'hacked' where id = 'a1a1a1a1-0000-4000-8000-000000000001';
delete from public.analyses where id = 'a1a1a1a1-0000-4000-8000-000000000001';

select is((select count(*)::int from public.ai_usage), 1, 'B sees only own ai_usage rows');
select is((select kind from public.ai_usage limit 1), 'transcribe', 'B''s own usage row');
select lives_ok(
  $$insert into public.ai_usage (user_id, kind, model_id, input_tokens, output_tokens)
    values ('bbbbbbbb-0000-4000-8000-00000000000b', 'drills', 'claude-opus-5-5', 5, 6)$$,
  'B can insert own usage row');
select lives_ok(
  $$insert into public.ai_usage (kind) values ('analyze')$$,
  'user_id defaults to the caller');
select throws_ok(
  $$insert into public.ai_usage (user_id, kind) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'analyze')$$,
  '42501', null, 'B cannot insert usage for A');
select throws_ok(
  $$insert into public.ai_usage (user_id, kind, created_at)
    values ('bbbbbbbb-0000-4000-8000-00000000000b', 'analyze', now() - interval '2 days')$$,
  '42501', null, 'created_at cannot be back-dated by the client');
select throws_ok(
  $$update public.ai_usage set input_tokens = 0$$,
  '42501', null, 'usage rows cannot be updated');
select throws_ok(
  $$delete from public.ai_usage$$,
  '42501', null, 'usage rows cannot be deleted (no resetting the daily cap)');
select is((select count(*)::int from public.ai_usage where created_at >= date_trunc('day', now())), 3,
          'B''s usage today counts own rows only');

reset role;

select is((select coach_notes from public.analyses where id = 'a1a1a1a1-0000-4000-8000-000000000001'), '',
          'B cannot modify A''s analysis');
select is((select count(*)::int from public.analyses where id = 'a1a1a1a1-0000-4000-8000-000000000001'), 1,
          'B cannot delete A''s analysis');
select is((select count(*)::int from public.ai_usage where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 3,
          'B''s usage rows were recorded');

-- ---------------------------------------------------------------- user A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.ai_usage), 1, 'A sees only own ai_usage rows (not B''s, even in the household)');
select lives_ok(
  $$update public.analyses set deleted_at = now() where id = 'a1a1a1a1-0000-4000-8000-000000000001'$$,
  'A can soft-delete own analysis');
update public.analyses set status = 'error' where id = 'b1b1b1b1-0000-4000-8000-000000000001';
reset role;
select is((select status from public.analyses where id = 'b1b1b1b1-0000-4000-8000-000000000001'), 'done',
          'A cannot modify B''s analysis');
select ok((select deleted_at from public.analyses where id = 'a1a1a1a1-0000-4000-8000-000000000001') is not null,
          'soft delete recorded');

select * from finish();
rollback;
