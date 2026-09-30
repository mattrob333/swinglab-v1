# Deploying SwingLab 2026 with Supabase

SwingLab is local first: every clip and snapshot lives on the device. Supabase
adds sign-in and a private cloud mirror, so a swing recorded on the iPad shows up
on the iPhone and the pro library downloads to each device for offline use.

Without the two `NEXT_PUBLIC_SUPABASE_*` variables the app runs in **local-only
mode** (no sign-in, no sync). You can deploy that first and add Supabase later.

## What gets created

| Piece | Where | Notes |
| --- | --- | --- |
| `profiles` table | `supabase/migrations/20260930000100_core_schema.sql` | One row per user, created by a trigger. `is_admin` can only be set from the dashboard. |
| `clips`, `snapshots` tables | same | Mirror `Clip`/`Snapshot` in `src/lib/types.ts`. `deleted_at` = soft delete for sync. |
| `clips` bucket (private, 200 MB/file, mp4/mov/webm/jpeg/png) | same | Objects at `{user_id}/{clip_id}.mp4` (+ `.jpg` thumbnail). |
| `snapshots` bucket (private, 20 MB/file, jpeg/png) | same | Objects at `{user_id}/{snapshot_id}.jpg`. |
| Row level security on every table and on storage | same | See "Security model" below. |

## One-time setup (about 15 minutes)

### 1. Create the Supabase project from Vercel

Your Supabase organization is managed by Vercel, so create the project there:

1. Open the Vercel dashboard and select the existing SwingLab project.
2. Go to **Storage** (or **Integrations → Marketplace**) → **Create Database** → **Supabase**.
3. Name it **`swinglab-2026`**, pick the region closest to you (e.g. `us-east-1`), and create it.
4. When asked, **connect it to the SwingLab project** for all environments
   (Production, Preview, Development). Vercel then injects the environment
   variables below automatically.
5. Click **Open in Supabase** to get to the Supabase dashboard for the new project.

Environment variables the app reads (set by the integration):

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (browser + server) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **or** `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe key. Either works. |

The integration also adds `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`,
`POSTGRES_*` and others. The app never uses them at runtime; **never** rename
a secret key to a `NEXT_PUBLIC_` name. If the integration did not add either
public key, copy it from Supabase → **Project Settings → API Keys** and add it in
Vercel → Project → **Settings → Environment Variables**.

### 2. Apply the database migrations

From the repository root on your computer (needs Node; Docker is not needed for this):

```bash
npx supabase@2.118.0 login                      # opens the browser once
npx supabase@2.118.0 link --project-ref <ref>   # <ref> is the id in your project URL: https://<ref>.supabase.co
npx supabase@2.118.0 db push                    # applies supabase/migrations/*
```

`db push` asks for the database password (Supabase → **Project Settings →
Database**; reset it there if you never saw it). Re-run `db push` whenever a new
file appears in `supabase/migrations/`.

Check: Supabase → **Table Editor** shows `profiles`, `clips`, `snapshots`, each
with "RLS enabled"; **Storage** shows `clips` and `snapshots`, both **Private**.

### 3. Turn off public sign-ups

Supabase → **Authentication → Sign In / Providers**:

- **Allow new users to sign up**: **off**.
- **Email** provider: leave **enabled** (it is what password sign-in uses).
- **Confirm email**: either way; the accounts you create below are pre-confirmed.

(`supabase/config.toml` already sets `enable_signup = false` for the local stack.)

### 4. Create the two accounts

Supabase → **Authentication → Users → Add user → Create new user**, twice:

1. Your account: your email, a strong password, tick **Auto Confirm User**.
2. Your son's account: an email you control (e.g. `you+kid@gmail.com` works with
   Gmail), a password he can type on the iPad, tick **Auto Confirm User**.

A `profiles` row is created automatically for each.

### 5. Make yourself the admin

Admins are the only accounts that can add or edit **pro** clips (the shared pro
library). Supabase → **SQL Editor** → run (with your email):

```sql
update public.profiles
set is_admin = true, display_name = 'Dad'
where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
```

Optionally name your son's profile the same way (`is_admin` stays `false`).

### 6. Point auth at your site

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your production URL, e.g. `https://swinglab.vercel.app`.
- **Redirect URLs**: add `https://*-<your-vercel-team>.vercel.app/**` if you use preview deployments.

### 7. Redeploy

Vercel → **Deployments** → latest → **Redeploy** (env var changes only apply to
new builds). Open the site: you should land on **Sign in**.

### 8. On each device

1. Open the site in Safari, sign in.
2. **Share → Add to Home Screen**, and open SwingLab from the Home Screen icon from
   now on. Home-screen apps keep their storage; Safari can clear website data
   that has not been used for a while.
3. **Settings → Keep my swings on this device** (asks the browser for persistent storage).
4. Open the Library once on Wi-Fi so pro swings download for offline use.
   **Settings → Sync** shows what is still waiting.

## Plan limits to know about

- **Upload size.** The Free plan caps any single upload at **50 MB**, which
  overrides the 200 MB bucket limit. Trimmed swings are usually far smaller. On
  Pro, raise it under **Storage → Settings → Upload file size limit**.
- **Storage/egress.** Every device downloads each pro clip once and keeps it.
- **Pausing.** Free projects pause after a week without activity; unpause in the dashboard.

## Security model (and the one place to change it)

- Row level security (RLS) is on for every table. The `anon` role has no table
  grants, and neither table has an anon policy, so a request without a
  signed-in user reads nothing.
- Both buckets are **private**. Files are only reachable through short-lived
  signed URLs, created for a signed-in user whose RLS allows the read.
- Users can only create, change or delete **their own** rows and files (files
  must live under `{their user id}/`, and a row can only point at files in its
  owner's folder). Users cannot make themselves admin: `is_admin` is not updatable
  by users.
- **Pro clips** (`kind = 'pro'`) are readable by every signed-in user and writable only by admins.
- **Household sharing.** Athlete clips and snapshots are readable by **every
  signed-in user**. That is deliberate: there are exactly two accounts (you and
  your son) and sign-ups are off, so "every signed-in user" is your household.
  This rule lives in **one function**, `public.shares_household(owner uuid)` in
  the migration. If you ever add accounts outside the family, change that
  function first (write a new migration that replaces it, e.g. with a
  `household_members` lookup) — every table and storage policy uses it.
- No server route uses the secret/service-role key.

## Verifying security locally (optional, needs Docker)

```bash
npx supabase@2.118.0 start
npx supabase@2.118.0 test db                     # pgTAP: supabase/tests/database/rls.test.sql
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from `supabase status`> \
SUPABASE_TEST_SECRET_KEY=<SECRET_KEY from `supabase status`> \
node --test --experimental-strip-types supabase/tests/storage-http.test.ts
```

Never run the HTTP test against production: it creates and deletes users.

To try the app against the local stack, put the local URL and publishable key in
`.env.local`, restart `next dev`, and create users at http://127.0.0.1:54323
(Studio) or with the admin API.

## How sync behaves

- Runs on app load, on sign-in, when the device comes back online, when the app
  returns to the foreground, a few seconds after local changes, every 3 minutes,
  and on **Settings → Sync now**. Failures retry with backoff (5 s up to 5 min).
- Uploads your new or changed clips (the processed, seek-friendly file when it
  exists, otherwise the original, plus the thumbnail) and snapshots. A clip is
  uploaded again when its playable file is replaced after processing.
- Downloads everything you may read that is newer than the last sync, then fetches
  missing video files, **pro clips first**.
- Deleting a clip on one device soft-deletes it on the server (`deleted_at`), removes
  its files, and removes it from the other devices on their next sync.
- Clips recorded before signing in are claimed by the first account that signs in
  on that device.
- Pro clips imported by a non-admin account stay on that device (shown as
  "Device only" in Settings).
