# UserFlow Red Team skill

Tests an application end to end the way its different users would: each persona signs in and works through their real jobs in a headless browser, notes are kept as evidence, failures are traced to root cause in the code, and fixes are recommended or made and then retested.

It works with one agent testing personas in turn, or with parallel sub-agents (one per persona) that share one run folder.

## Files

| Path | Purpose |
|---|---|
| `SKILL.md` | Operating instructions (the method, phases 0-12) |
| `references/ORCHESTRATION.md` | How to dispatch persona sub-agents so their notes reach a shared place |
| `references/BROWSER.md` | Browser driver reference, sessions, setup and troubleshooting |
| `references/JEV-QUESTION-BANK.md` | Judgment questions for Jev (TypeSafe) or manual use |
| `references/TREG-EXTERNAL-VALIDATION.md` | Out-of-band checks of effects outside the app |
| `templates/AGENT-BRIEF.md` | The prompt each persona sub-agent receives |
| `templates/FINDING.md` | One-file-per-finding format and severity definitions |
| `templates/REPORT-TEMPLATE.md` | Final report |
| `templates/VISUAL-REPAIR-PACKET.md` | Screenshot, annotation, concept and acceptance test for UI findings |
| `scripts/preflight.mjs` | Creates the run folder, proves it is writable, proves the browser works |
| `scripts/browser.mjs` | Per-agent, per-persona persistent headless browser driver |
| `scripts/merge.mjs` | Merges all agents' notes into one ledger with global finding IDs |

Requirements: Node 18+ and the `playwright` package installed locally or globally, with a Chromium it can launch. The scripts never download packages or browsers.

## Quick start

From the repository under test, with the app running:

```bash
node .claude/skills/userflow-red-team/scripts/preflight.mjs --url http://localhost:5173 --agents A1,A2,A3
```

Then ask the agent:

> Run the UserFlow Red Team skill against this app at http://localhost:5173. Discovery only, no code changes.

Add `.userflow-redteam/` to `.gitignore`; run folders hold screenshots and browser profiles.

See `examples/INVOKE.md` for fuller prompts, including an audit-then-fix run.

## Installing elsewhere

Copy this folder to `<repo>/.claude/skills/userflow-red-team/` (project skill) or `~/.claude/skills/userflow-red-team/` (personal skill) for Claude Code. Other agents can be pointed at `SKILL.md` directly.
