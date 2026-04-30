# SwingLab V1 — PRD Quick Capture + Synced Pro Compare

## One Sentence
Capture a swing live, tag the sequence in seconds, select a preloaded pro, and scrub both swings in perfect sync.

## V1 Scope (No AI)
Mobile-first live-game swing capture, fast phase tagging, and buttery-smooth pro comparison scrubbing. No AI vision report.

## Stack
- **Web prototype**: Next.js 16 + Tailwind (this repo)
- **Target mobile**: React Native + VisionCamera + SQLite (V1.0)

## Key Screens
1. **Quick Capture** — Full-screen camera, 1:1 reticle, record/flip (PRD §6.1)
2. **Tag Swing** — Frame scrubber + 7 phase buttons with validation (PRD §6.2)
3. **Pro Selector** — 20-30 preloaded pro swings, handedness filter (PRD §6.3)
4. **Compare Screen** — Stacked pro/player, normalized phase scrubber (PRD §6.4)

## Phase Model
7 phases: Stance → Load → Launch → Turn → Contact → Extension → Finish
Required minimum: Stance, Load, Launch, Contact, Finish

## Sync Engine
Phase-normalized: scrubber progress maps to each video's phase-tagged frames independently.
No raw MP4 seeking during scrub — uses frame-cache rendering.

## Data Models
Defined in PRD §12: PlayerProfile, SwingClip, FrameCacheManifest, PhaseMarkers, ProSwing, ComparisonSession
