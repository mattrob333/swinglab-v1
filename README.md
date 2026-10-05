# SwingLab 2026

Record a swing, trim and crop it, swipe to a pro, flip to match handedness, scrub both into position, and snapshot the comparison. Then, after the fact, have AI analyze the snapshots and find drill videos.

Built for an iPhone (portrait) and an iPad (landscape). Local first: clips and snapshots live on the device, so it works at a field with no signal. Supabase adds sign-in and syncs between devices.

## Get it on a laptop

```bash
git clone https://github.com/mattrob333/swinglab-v1.git   # or swinglab-2026 once the repo is renamed
cd swinglab-v1
git checkout claude/vigilant-pascal-8nge7a                # the rebuild lives on this branch until it's merged
npm install
npm run dev                                               # http://localhost:3000
```

With no environment variables the app runs in **local-only mode**: no sign-in, no sync, no AI. Everything else works. In the app, go to **Library → Load sample clips** to get test videos.

Node 20+ is required.

### Try it on your phone from the laptop

Phones need HTTPS for the camera. Easiest: deploy a Vercel preview (push the branch), or run `npx next dev --experimental-https` and open `https://<laptop-ip>:3000` on the phone (accept the certificate warning).

### Environment variables

Copy `.env.example` to `.env.local` and fill in what you need. Details in [docs/DEPLOY.md](docs/DEPLOY.md).

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sign-in and sync (set automatically by the Vercel Supabase integration) |
| `ANTHROPIC_API_KEY` | AI analysis with Claude Opus 5.5, drill video search |
| `OPENAI_API_KEY` | GPT-6.1 Sol second opinion, voice-note transcription |

## Checks

```bash
npm test              # unit tests (node:test)
npm run typecheck     # TypeScript
npx eslint src tests e2e
npx playwright test   # browser tests on iPhone 15 and iPad Pro 11 profiles (needs `npx playwright install chromium` once on a laptop)
npx next build
```

## Where things are

| Path | What |
|---|---|
| `docs/ARCHITECTURE.md` | How the app is put together and why (read first) |
| `docs/DEPLOY.md` | Supabase + Vercel setup, security model, AI keys and costs |
| `docs/STATUS.md` | What's done, what's next, known issues |
| `src/lib/types.ts` | Shared data types |
| `src/lib/store/` | On-device storage (IndexedDB) |
| `src/lib/player/`, `src/components/player/` | Compare screen and the scrub engine |
| `src/lib/media/`, `src/components/capture/` | Recording, trimming, crop, background re-encode |
| `src/lib/sync/`, `src/lib/supabase/`, `supabase/` | Auth, database, sync |
| `src/lib/ai/`, `src/app/api/ai/`, `src/components/ai/` | AI analysis, voice notes, drill videos |
| `.claude/skills/userflow-red-team/` | Red-team skill for testing the app as each user |

This is Next.js 16: APIs differ from older versions. Read `AGENTS.md` and `node_modules/next/dist/docs/` before changing framework code.
