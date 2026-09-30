# Changelog

## 2.0

Rewritten after field use showed that sub-agents could not share notes and the browser could not be used reliably.

- Added a run folder (`.userflow-redteam/runs/<id>/`) with one writer per file: agents write only their own `agents/<ID>/` folder, the orchestrator writes `shared/` and `report/`, and handoff notes are new files rather than edits.
- Added `scripts/preflight.mjs`: proves the run folder is writable and that headless Chromium launches, loads the app and saves a screenshot before any agent is dispatched. Finds installed Playwright and browsers; never runs `npx playwright install`.
- Added `scripts/browser.mjs`: a per-agent, per-persona persistent browser driver for any agent with a shell. Logins survive between calls (session cookies are saved and restored), the same login works across viewports, concurrent use of one profile is refused, and every call saves a screenshot, accessibility snapshot, console errors, failed requests and HTTP errors into the agent's folder.
- Added `scripts/merge.mjs`: merges every agent's findings into one ledger, assigns global `UFR-###` IDs by severity (agents use local IDs such as `A2-003`), groups by `root_cause`, and lists merge problems such as unfinished agents or missing screenshots.
- Added `templates/AGENT-BRIEF.md` (absolute paths, a write test as the first action, and a reply-block fallback when an agent cannot write) and `templates/FINDING.md`.
- Added `references/ORCHESTRATION.md` and `references/BROWSER.md`.
- `SKILL.md`: rewritten around the orchestrator and persona-agent structure. Requires opening screenshots for visual judgment, notes written during testing rather than at the end, handoff chains driven end to end under one driver, and `CODE-REVIEW ONLY` when the browser cannot run.
- `browser.mjs` marks console and network errors already seen by that persona as `(repeat)`, so new errors stand out.
- Moved the Jev question bank and treg playbook to `references/`.

## 1.1

- Added treg as an optional external validation and capability layer.
- Added `templates/TREG-EXTERNAL-VALIDATION.md`.

## 1.0

- Initial UserFlow Red Team skill package.
