# Example prompts

## Discovery audit, parallel personas

> Use the userflow-red-team skill on this repository. Start the app locally with fictional seed data and run preflight. Write the product model, personas, flows and test cases into the run folder's `shared/`. Then run one sub-agent per persona using `templates/AGENT-BRIEF.md`, giving each its own account and data. After they finish, run `merge.mjs`, clear every merge problem, drive the cross-user handoffs yourself, and write `report/REPORT.md`. Discovery only: no code changes. Use Jev and treg only if they are actually available, and say so if not.

## Small app, one agent

> Use the userflow-red-team skill in sequential mode. Test each persona yourself with `browser.mjs`, one `--session` per persona, desktop and mobile. Keep notes and findings in the run folder as you go, merge at the end, and give me the report.

## Audit, then fix

> Run the userflow-red-team audit first. When the report is complete, fix the BLOCKER, PERMISSION FAILURE, LOGIC FAILURE, STATE FAILURE and DEAD END findings, plus high-impact AMBIGUITY findings, following this repository's contribution rules. Retest each fix with the original steps on a fresh profile and add before/after screenshots to the report.

## What to ask for at the end

1. `report/REPORT.md` and `report/ledger.md`
2. the run folder path
3. the top systemic root causes
4. the exact retest plan
5. a fix plan ordered by dependency, not cosmetic severity
