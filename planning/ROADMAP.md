# SwingLab V1 — Project Roadmap

## Product
Mobile-first baseball swing capture and synced pro comparison tool.

**[GitHub](https://github.com/mattrob333/swinglab-v1)**

## Milestones (PRD Section 20)

| # | Phase | Status | PR | Description |
|---|-------|--------|----|-------------|
| M0 | Scaffold (Next.js + Tailwind) | ✅ Done | `main` | Initial template |
| M1 | **Compare prototype** | ✅ Done | `feat/compare-prototype` | Stacked frame viewers + normalized phase scrubber + phase sync engine (PRD §21.1) |
| M2 | Quick Capture + Reticle | ✅ Done | `feat/compare-prototype` | Camera viewfinder w/ 1:1 reticle, record/flip/cancel (PRD §6.1) |
| M3 | Tag Swing workflow | ✅ Done | `feat/compare-prototype` | Frame scrubber + 7 phase buttons + validation (PRD §6.2) |
| M4 | Pro library selector | ✅ Done | `feat/compare-prototype` | 5 mock pro swings, handedness filter, flip toggle (PRD §6.3) |
| M5 | Compare screen | ✅ Done | `feat/compare-prototype` | Stacked pro/player, synced scrubber, phase label, phase sync toggle (PRD §6.4) |
| — | Frame asset generation | ⏳ Next | — | Canvas-drawn batter silhouettes at 7 phases |
| — | Pro swing frame caches | ⏳ Later | — | Bundled frame assets for 20-30 pro swings |
| — | React Native port | V1.0 | — | Expo + VisionCamera + SQLite |

## Key Technical Decisions

- **PRD §21.1**: First build the synced scrubber prototype with synthetic frames
- **PRD §10.4**: Frame-cache rendering (not raw MP4 seeking) for smooth scrubbing
- **PRD §9**: Phase-normalized sync (compare by swing stage, not timestamp)
- **PRD §10.2**: Local-first capture → crop → extract frames → tag → compare
