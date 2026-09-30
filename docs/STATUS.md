# Status

Last updated: 2026-09-30.

## Done

- **Compare screen**: pro on top, athlete below (side by side on iPad). Swipe through pros, auto-flip for opposite handedness, per-pane scrubbers with frame step, ½× and ¼× playback, Link mode (slo-mo corrected), pinch/pan crop, snapshots and the Snaps gallery.
- **Scrub engine**: one seek in flight, always to the latest target, frames presented via `requestVideoFrameCallback`. Fine scrubbing: slide the finger away from the track to slow to ½, ¼ or ⅒ speed.
- **Record → trim → crop → compare**: in-app recording, import from Photos, filmstrip trim, autosaved edits, background re-encode of the trimmed swing (keyframe every 2 frames) with Mediabunny.
- **Library**: bulk pro import from a folder, sample clips.
- **Backend**: Supabase schema with RLS everywhere, private storage, email/password login, local-first sync between devices, offline pro library, offline app shell. Not connected yet: the Supabase project still has to be created from Vercel (see `docs/DEPLOY.md`).
- **Red team**: one full userflow red-team pass (coach on iPhone, son on iPad, setup on desktop); 9 findings, all fixed and retested.

## Next

1. Create the Supabase project from Vercel, apply migrations, create the two accounts (`docs/DEPLOY.md`).
2. Point the Vercel project at this repo/branch and deploy; test on the real iPhone and iPad.
3. Verify on real devices: recording quality, re-encode speed, Photos import of slo-mo/HEVC, share sheet, safe areas.

## Known issues / ideas

- The test browser (Chromium in CI/cloud) can't play H.264, so e2e tests use generated WebM clips. Real-device testing is the true check.
- Stacked snapshots include the dark controls band between the two videos.
- Snaps thumbnails are portrait-shaped, so landscape snapshots look small.
- "Re-trim from original" resets to the full length.
- A clip left via Back isn't queued for re-encode until Home or Library is opened.
- Pro clips imported from a non-admin account stay on that device.
