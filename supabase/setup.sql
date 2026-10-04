-- SwingLab 2026: full database setup.
-- Paste this whole file into Supabase -> SQL Editor -> New query, and click Run once.
-- It is the two files in supabase/migrations/ combined, in order.
-- Run it only on a NEW, empty project.

begin;

-- SwingLab 2026: core schema, row level security and private storage.
--
-- Mirrors the frozen client contract in src/lib/types.ts (Clip, Snapshot) in
-- snake_case. The device (IndexedDB) is the source of truth for the UI; these
-- tables are the cloud mirror written by src/lib/sync.
--
-- SECURITY MODEL (read this before changing anything)
--   * RLS is enabled on every table; the anon role has no grants and no policies,
--     so an unauthenticated request can read nothing, anywhere.
--   * Users write only their own rows and only objects under their own folder
--     ({auth.uid()}/...). Nobody can edit or delete another user's data.
--   * kind = 'pro' clips are readable by every signed-in user and writable only
--     by admins (profiles.is_admin, which users cannot set on themselves).
--   * "Household" read access: athlete clips and snapshots owned by someone else
--     are readable when public.shares_household(owner) is true. Today that
--     function returns true for every signed-in user, because the project has
--     exactly two accounts (a parent and his son) and sign-ups are disabled.
--     If more accounts are ever added, change ONLY that function (for example
--     to look up a household table); every table and storage policy calls it.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  default_handedness text not null default 'R' check (default_handedness in ('L', 'R')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user, created by trigger on signup.';
comment on column public.profiles.is_admin is 'Admins may create/edit pro clips. Set only from the dashboard/SQL editor.';

alter table public.profiles enable row level security;

-- Create a profile whenever an auth user is created (dashboard "Add user" included).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Access helpers (the single place that defines who may read what)
-- ---------------------------------------------------------------------------

-- True when the calling user is an admin. SECURITY DEFINER so it can read
-- profiles regardless of the caller's RLS; it only ever reveals the caller's flag.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- HOUSEHOLD RULE. May the calling user read athlete clips / snapshots owned by
-- `owner`? Currently: any signed-in user may (two accounts, sign-ups disabled).
-- To restrict later, replace the body, e.g.
--   select owner = auth.uid() or exists (select 1 from public.household_members a
--     join public.household_members b using (household_id)
--     where a.user_id = auth.uid() and b.user_id = owner);
create function public.shares_household(owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null and owner is not null;
$$;

-- Owner folder of a storage object name "{owner_uuid}/{file}", or null when the
-- name does not start with a UUID folder (never raises on bad input).
create function public.object_owner(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when object_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.shares_household(uuid) from public, anon;
revoke all on function public.object_owner(text) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.shares_household(uuid) to authenticated;
grant execute on function public.object_owner(text) to authenticated;

-- Server-side change cursor. Every write stamps server_updated_at = now() so the
-- sync layer can pull "rows changed since X" without trusting device clocks.
create function public.stamp_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- clips  (mirrors Clip in src/lib/types.ts)
-- ---------------------------------------------------------------------------

create table public.clips (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pro', 'athlete')),
  title text not null default '',
  handedness text not null default 'R' check (handedness in ('L', 'R')),
  camera_view text not null default 'other' check (camera_view in ('open', 'closed', 'behind', 'front', 'other')),
  duration_sec double precision not null default 0 check (duration_sec >= 0),
  fps double precision check (fps is null or fps > 0),
  width integer not null default 0 check (width >= 0),
  height integer not null default 0 check (height >= 0),
  slo_mo_factor double precision not null default 1 check (slo_mo_factor > 0),
  trim_start double precision not null default 0,
  trim_end double precision not null default 0,
  crop jsonb not null default '{"scale": 1, "x": 0, "y": 0}'::jsonb,
  processed boolean not null default false,
  notes text not null default '',
  storage_path text,
  thumb_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  -- Object paths must live in the owner's own folder, so a row can never point
  -- at somebody else's file.
  constraint clips_storage_path_in_owner_folder
    check (storage_path is null or storage_path like owner_id::text || '/%'),
  constraint clips_thumb_path_in_owner_folder
    check (thumb_path is null or thumb_path like owner_id::text || '/%'),
  constraint clips_crop_is_object check (jsonb_typeof(crop) = 'object')
);

comment on table public.clips is 'Cloud mirror of on-device clips. deleted_at is a soft-delete tombstone for sync.';

create index clips_server_updated_at_idx on public.clips (server_updated_at);
create index clips_owner_idx on public.clips (owner_id);
create index clips_kind_idx on public.clips (kind);

create trigger clips_stamp before insert or update on public.clips
  for each row execute function public.stamp_server_updated_at();

alter table public.clips enable row level security;

create policy "clips: read pro, own, and household"
  on public.clips for select to authenticated
  using (
    kind = 'pro'
    or owner_id = (select auth.uid())
    or public.shares_household(owner_id)
  );

create policy "clips: insert own athlete clips; admins insert pro clips"
  on public.clips for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (kind = 'athlete' or (select public.is_admin()))
  );

create policy "clips: update own athlete clips; admins update pro clips"
  on public.clips for update to authenticated
  using (
    (owner_id = (select auth.uid()) and kind = 'athlete')
    or (kind = 'pro' and (select public.is_admin()))
  )
  with check (
    (owner_id = (select auth.uid()) and kind = 'athlete')
    or (kind = 'pro' and (select public.is_admin()))
  );

create policy "clips: delete own athlete clips; admins delete pro clips"
  on public.clips for delete to authenticated
  using (
    (owner_id = (select auth.uid()) and kind = 'athlete')
    or (kind = 'pro' and (select public.is_admin()))
  );

-- ---------------------------------------------------------------------------
-- snapshots  (mirrors Snapshot in src/lib/types.ts)
-- ---------------------------------------------------------------------------

create table public.snapshots (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_type text not null default 'image/jpeg' check (image_type in ('image/jpeg', 'image/png')),
  -- No foreign keys: a snapshot may reference a clip that has not synced yet.
  top_clip_id uuid,
  bottom_clip_id uuid,
  top_time double precision,
  bottom_time double precision,
  top_flipped boolean not null default false,
  bottom_flipped boolean not null default false,
  note text not null default '',
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  constraint snapshots_storage_path_in_owner_folder
    check (storage_path is null or storage_path like owner_id::text || '/%')
);

create index snapshots_server_updated_at_idx on public.snapshots (server_updated_at);
create index snapshots_owner_idx on public.snapshots (owner_id);

create trigger snapshots_stamp before insert or update on public.snapshots
  for each row execute function public.stamp_server_updated_at();

alter table public.snapshots enable row level security;

create policy "snapshots: read own and household"
  on public.snapshots for select to authenticated
  using (owner_id = (select auth.uid()) or public.shares_household(owner_id));

create policy "snapshots: insert own"
  on public.snapshots for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "snapshots: update own"
  on public.snapshots for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "snapshots: delete own"
  on public.snapshots for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles policies and column privileges
-- ---------------------------------------------------------------------------

create policy "profiles: read own and household"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_household(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants everything to anon/authenticated by default; tighten.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.clips, public.snapshots from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
-- Users may edit only these profile columns: is_admin/id/created_at stay locked.
grant update (display_name, default_handedness) on public.profiles to authenticated;
revoke all on public.clips, public.snapshots from authenticated;
grant select, insert, update, delete on public.clips, public.snapshots to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private buckets. Object names are "{owner_id}/{id}.{ext}".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('clips', 'clips', false, 209715200, -- 200 MB
    array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png']),
  ('snapshots', 'snapshots', false, 20971520, -- 20 MB
    array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reading an object: own folder, household folder, or (clips bucket) the file
-- of a pro clip row visible to the caller.
create policy "storage: read own, household, and pro clip files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('clips', 'snapshots')
    and (
      public.object_owner(name) = (select auth.uid())
      or public.shares_household(public.object_owner(name))
      or (
        bucket_id = 'clips'
        and exists (
          select 1 from public.clips c
          where c.kind = 'pro' and (c.storage_path = name or c.thumb_path = name)
        )
      )
    )
  );

-- Writing an object: only into your own folder, with a strict name shape.
create policy "storage: upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('clips', 'snapshots')
    and public.object_owner(name) = (select auth.uid())
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|mov|webm|jpg|png)$'
  );

create policy "storage: update own objects"
  on storage.objects for update to authenticated
  using (bucket_id in ('clips', 'snapshots') and public.object_owner(name) = (select auth.uid()))
  with check (
    bucket_id in ('clips', 'snapshots')
    and public.object_owner(name) = (select auth.uid())
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|mov|webm|jpg|png)$'
  );

create policy "storage: delete own objects"
  on storage.objects for delete to authenticated
  using (bucket_id in ('clips', 'snapshots') and public.object_owner(name) = (select auth.uid()));


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


commit;
