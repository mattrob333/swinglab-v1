# SwingLab 2026 architecture

The product in one line: **record a swing, trim and crop it, swipe to a pro, flip to match handedness, scrub each video into position, snapshot the comparison.** It must work in seconds, on an iPhone (portrait) and an iPad (landscape), at a field with bad signal.

Users today: the owner (a parent/coach) and his son. No teams. AI analysis, voice notes and a coach inbox come later and read from saved snapshots and clips.

## Principles

1. **Local first.** Every clip and snapshot lives on the device in IndexedDB (`src/lib/store/local-db.ts`). Screens read only from the local store. Supabase is a mirror: the sync layer uploads local changes and downloads the pro library when online.
2. **Never scrub over the network.** Videos play from local blobs (object URLs).
3. **Seek-friendly files.** After trimming, the swing window is re-encoded on the device (Mediabunny / WebCodecs) to H.264 with a keyframe every frame or two, so any frame decodes instantly. Until that finishes the original plays.
4. **The scrub engine lives outside React.** Scrubbing writes a target time to a ref; a scheduler keeps at most one seek in flight and always seeks to the latest target; frames are presented with `requestVideoFrameCallback`. React never re-renders per frame.
5. **Real seconds.** Linked scrubbing works in real time corrected by each clip's `sloMoFactor`, so clips with different frame rates and slo-mo exports move together.

## Layout

```
src/
  lib/
    types.ts            shared domain types (frozen contract)
    store/              IndexedDB store + React hooks (frozen contract)
    supabase/           browser + server clients            [data agent]
    sync/               upload/download between store and Supabase [data agent]
    player/             seek scheduler, clock, link math, snapshot composer [player agent]
    media/              recorder, probe, transcode, thumbnail, trim [capture agent]
  components/
    shell/              app shell, tab bar                  [orchestrator]
    player/             VideoPane, Scrubber, FrameStep, carousel [player agent]
    capture/            recorder UI, trim editor, crop editor [capture agent]
  app/
    page.tsx            Home: big Record button + recent swings [capture agent]
    capture/            record or import                     [capture agent]
    clips/[id]/edit     trim, crop, handedness, slo-mo       [capture agent]
    compare/            the compare screen                   [player agent]
    library/            pros and swings; bulk pro import      [capture agent]
    snaps/              snapshot gallery                     [player agent]
    login/              Supabase auth                        [data agent]
  proxy.ts              auth gate (Next 16 "proxy", formerly middleware) [data agent]
supabase/
  migrations/           schema, RLS, storage buckets         [data agent]
scripts/
  seed-pros.ts          bulk upload a folder of pro swings   [data agent]
tests/                  node:test unit tests (pure logic)
e2e/                    Playwright tests (iPhone + iPad profiles)
```

## Local-only mode

If `NEXT_PUBLIC_SUPABASE_URL` is not set, the app runs without sign-in and without sync. This is how development and the Playwright tests run, and it means the app is never blocked on the backend.

## Rules for contributors (humans and agents)

- Read `AGENTS.md`: this is Next.js 16; check `node_modules/next/dist/docs/` before using a Next API.
- Mobile Safari is the primary target. Touch first; every control at least 44px; respect safe-area insets; no hover-only UI.
- Styling: Tailwind 4 with the tokens in `src/app/globals.css` (dark UI, neon `#C8F000` accent).
- Keep pure logic (math, schedulers, parsers) in framework-free modules with node:test coverage in `tests/`.
