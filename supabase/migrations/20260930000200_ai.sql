-- SwingLab 2026: AI coaching tables.
--
-- analyses  Cloud mirror of Analysis in src/lib/types.ts (snake_case). Written
--           by the device through sync, and by /api/ai/analyze with the
--           caller's own JWT when a report finishes. Same access rules as
--           snapshots: read own + household, write own only.
-- ai_usage  One row per paid AI request (analyze, transcribe, drills), used for
--           the per-user daily cap. Owner-only read; insert own rows only
--           (the server inserts with the user's JWT); no updates or deletes, so
--           nobody can reset their own count.

-- ---------------------------------------------------------------------------
-- analyses
-- ---------------------------------------------------------------------------

create table public.analyses (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- No foreign keys: an analysis may reference snapshots that have not synced yet.
  snapshot_ids uuid[] not null default '{}',
  model text not null check (model in ('opus', 'sol')),
  model_id text not null default '' check (char_length(model_id) <= 100),
  coach_notes text not null default '' check (char_length(coach_notes) <= 20000),
  transcript text not null default '' check (char_length(transcript) <= 50000),
  result jsonb,
  drill_videos jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  error text check (error is null or char_length(error) <= 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  constraint analyses_snapshot_count check (cardinality(snapshot_ids) <= 24),
  constraint analyses_result_is_object check (result is null or jsonb_typeof(result) = 'object'),
  constraint analyses_drill_videos_is_array check (jsonb_typeof(drill_videos) = 'array'),
  constraint analyses_payload_size check (pg_column_size(result) is null or pg_column_size(result) <= 262144),
  constraint analyses_drill_videos_size check (pg_column_size(drill_videos) <= 65536)
);

comment on table public.analyses is 'Cloud mirror of on-device AI analyses. deleted_at is a soft-delete tombstone for sync.';

create index analyses_server_updated_at_idx on public.analyses (server_updated_at);
create index analyses_owner_idx on public.analyses (owner_id);

create trigger analyses_stamp before insert or update on public.analyses
  for each row execute function public.stamp_server_updated_at();

alter table public.analyses enable row level security;

create policy "analyses: read own and household"
  on public.analyses for select to authenticated
  using (owner_id = (select auth.uid()) or public.shares_household(owner_id));

create policy "analyses: insert own"
  on public.analyses for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "analyses: update own"
  on public.analyses for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "analyses: delete own"
  on public.analyses for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.analyses from anon;
revoke all on public.analyses from authenticated;
grant select, insert, update, delete on public.analyses to authenticated;

-- ---------------------------------------------------------------------------
-- ai_usage
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('analyze', 'transcribe', 'drills')),
  model_id text not null default '' check (char_length(model_id) <= 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0)
);

comment on table public.ai_usage is 'One row per paid AI request; the daily cap counts rows since UTC midnight.';

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

create policy "ai_usage: read own"
  on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

create policy "ai_usage: insert own"
  on public.ai_usage for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.ai_usage from anon;
revoke all on public.ai_usage from authenticated;
grant select on public.ai_usage to authenticated;
-- created_at is not insertable: it always comes from the database clock, so a
-- row can never be back-dated out of today's window. No update/delete grants.
grant insert (user_id, kind, model_id, input_tokens, output_tokens) on public.ai_usage to authenticated;
