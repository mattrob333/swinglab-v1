# Status

Last updated: 2026-09-30.

## Done

- **Compare screen**: pro on top, athlete below (side by side on iPad). Swipe through pros, auto-flip for opposite handedness, per-pane scrubbers with frame step, ½× and ¼× playback, Link mode (slo-mo corrected), pinch/pan crop, snapshots and the Snaps gallery.
- **Scrub engine**: one seek in flight, always to the latest target, frames presented via `requestVideoFrameCallback`. Fine scrubbing: slide the finger away from the track to slow to ½, ¼ or ⅒ speed.
- **Record → trim → crop → compare**: in-app recording, import from Photos, filmstrip trim, autosaved edits, background re-encode of the trimmed swing (keyframe every 2 frames) with Mediabunny.
- **Library**: bulk pro import from a folder, sample clips.
- **Backend**: Supabase schema with RLS everywhere, private storage, email/password login, local-first sync between devices, offline pro library, offline app shell. Not connected yet: the Supabase project still has to be created from Vercel (see `docs/DEPLOY.md`).
- **AI coaching** (needs sign-in + API keys; see `docs/DEPLOY.md` → AI coaching):
  - Snaps → Select 1–6 snapshots → Analyze with Claude Opus 5.5 (default), GPT-6.1 Sol, or both side by side. Structured report: summary, strengths, issues by swing phase and severity (linked to the snapshots), drills, cues, next focus.
  - "Find drill videos": Opus searches YouTube and returns only links it actually found; plays inline.
  - Voice notes on snapshots and in the Analyze sheet, transcribed with OpenAI.
  - Security: every AI route requires a signed-in user, has a daily cap (`AI_DAILY_LIMIT`, default 30), validates image sizes/types, and logs token usage per user. Analyses sync between devices.
- **Red team**: one full userflow red-team pass (coach on iPhone, son on iPad, setup on desktop); 9 findings, all fixed and retested.

## Next

1. Create the Supabase project from Vercel, apply migrations, create the two accounts (`docs/DEPLOY.md`).
2. Point the Vercel project at this repo/branch and deploy; test on the real iPhone and iPad.
3. Verify on real devices: recording quality, re-encode speed, Photos import of slo-mo/HEVC, share sheet, safe areas.

## Known issues / ideas

- AI calls have only been tested with mocks (no real API spend). First real run: check that the Opus drill search (web search + JSON answer) and GPT-6.1 Sol's `reasoning.effort` setting are accepted.
- Vercel limits request bodies to 4.5 MB, so very long voice notes (over ~4 minutes) are rejected.
- The test browser (Chromium in CI/cloud) can't play H.264, so e2e tests use generated WebM clips. Real-device testing is the true check.
- Stacked snapshots include the dark controls band between the two videos.
- Snaps thumbnails are portrait-shaped, so landscape snapshots look small.
- "Re-trim from original" resets to the full length.
- A clip left via Back isn't queued for re-encode until Home or Library is opened.
- Pro clips imported from a non-admin account stay on that device.
