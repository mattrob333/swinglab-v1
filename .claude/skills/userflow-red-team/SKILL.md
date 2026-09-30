---
name: userflow-red-team
description: End-to-end adversarial user-flow testing. Drives the running app in a real headless browser as each distinct user type (optionally with parallel sub-agents, one per persona), records evidence in a shared run folder, traces failures to root cause in the code, recommends or implements fixes, and retests. Use when asked to red-team, user-test, QA, or walk through an app as different users, find dead ends or broken handoffs, or produce a user-flow audit report.
version: 2.0
---

# UserFlow Red Team

## Goal

Use the application the way its real users would, one user type at a time, in a real browser. Find every place where a user cannot finish their job, cannot tell what to do, gets the wrong result, or cannot recover. Write down evidence as you go. Trace each failure to its cause in the code. Then recommend or make the smallest fix and retest with the same steps.

A flow passes only when the intended user can understand what to do, complete the job, tell that it worked, recover from mistakes, and know what comes next. A 200 response, a clickable button or a polished screen is not a pass.

## How a run is organized

```
ORCHESTRATOR (you, the main session)
  0. preflight.mjs      -> proves the run folder is writable and the browser works
  1-4. recon, personas, flows, test cases   (you do these; written to shared/)
  5. dispatch           -> one sub-agent per persona (or you run personas yourself)
        each agent: browser.mjs with its own profile, notes in its own folder
  6. merge.mjs          -> one ledger with global UFR ids, coverage, merge problems
  7. handoffs, root cause, report, fixes, retest   (you)
```

Everything for one run lives in one folder:

```
<repo>/.userflow-redteam/runs/<run-id>/        (gitignored)
  run.json                 preflight result: URL, browser launch details, agent folders
  shared/                  ORCHESTRATOR writes: product-model.md, personas.md, flows.md,
                           test-cases.md, accounts.md (no secrets)
  shared/handoffs/         any agent may ADD a new file; nobody edits another's file
  agents/<ID>/             ONLY agent <ID> writes here
    status.json            state, persona, flows + verification status, summary
    notes.md               running journal
    findings/<ID>-NNN.md   one file per finding (format: templates/FINDING.md)
    screens/               screenshots + accessibility snapshots from browser.mjs
    profiles/              that agent's browser profiles (logins persist here)
    actions.jsonl          every browser action, URL, console/network errors
  report/                  ORCHESTRATOR: ledger.md (from merge.mjs), REPORT.md
  artifacts/               annotated and proposed images for the final report
```

These rules exist because the earlier version failed in practice:

1. **One writer per file.** Agents write only inside `agents/<their ID>/`. Shared files are written by the orchestrator. Handoff notes are new files named `<FROM>-to-<TO>-<n>.md`, never edits. Parallel agents appending to one notes file lose each other's writes.
2. **Absolute paths only.** Give every agent the absolute `RUN_DIR` printed by preflight. Relative paths resolve against whatever working directory the agent has, and worktree-isolated agents write into their own copy of the repo, where the orchestrator never sees the files.
3. **Agents must be able to write.** Dispatch agents that have file-write and shell tools (for Claude Code, `general-purpose`; not read-only types such as `Explore` or `Plan`). Do not use worktree isolation for test agents. Each agent's first action is a write test into its folder.
4. **Return-message fallback.** If an agent still cannot write, it puts its full status, notes and findings in its final reply inside the blocks shown in `templates/AGENT-BRIEF.md`, and the orchestrator saves them into that agent's folder before merging. Findings are never lost because a write failed.
5. **Agent-local IDs.** Agents number findings `<ID>-001`, `<ID>-002`. `merge.mjs` assigns the global `UFR-###` IDs. Parallel agents numbering `UFR-001` independently collide.
6. **One browser per agent and persona.** Do not share a single Playwright MCP browser between parallel agents; they navigate each other's tabs and overwrite each other's login. Use `scripts/browser.mjs`, which gives each (agent, persona, viewport) its own persistent profile. Playwright MCP is fine when only the orchestrator is driving.
7. **Prove the browser before fanning out.** `preflight.mjs` launches headless Chromium, loads the target, and saves a screenshot. If it fails, fix it or declare `CODE-REVIEW ONLY` before any agent starts. Never run `npx playwright install` in a sandbox; use the installed package and browsers (see `references/BROWSER.md`).

Read `references/ORCHESTRATION.md` before dispatching sub-agents and `references/BROWSER.md` before driving the browser.

---

# Phase 0: Environment and preflight

1. Read the repository instructions (AGENTS.md, CLAUDE.md, CONTRIBUTING.md, README) and follow them.
2. Work out how to run the app and which environment to test: local, preview, staging. **Do not modify production data** unless explicitly authorized. Prefer local with fictional seed data.
3. Start the app (in the background) and confirm it answers.
4. Find test accounts, seed data, tenants and roles. If the assignment allows local changes and safe accounts do not exist, create the minimum fixtures. Record how to sign in as each persona in `shared/accounts.md` (never paste secrets or bearer links into reports).
5. Run preflight from the repository root:

   ```bash
   node <skill-dir>/scripts/preflight.mjs --url http://localhost:5173 --agents A1,A2,A3
   ```

   It prints `RUN_DIR=...`. Make sure `.userflow-redteam/` is in `.gitignore`.
6. Note which optional layers exist: Jev (structured judgments), treg (external verification), image generation, logs, direct database access. Missing layers are reported as not executed. They are never invented.

# Phase 1: Product reconnaissance

Build a model before clicking. From docs, routes, components, endpoints, schema, state enums, permission checks, tests, seed data and the running app, write `shared/product-model.md`:

- product purpose and the business outcome it should produce
- inputs, transformations, outputs, dependencies
- state model: the states that matter (user, record, request, workflow)
- permissions: who can see, create, edit, approve, share, delete
- what "done" means for each major flow

Keep **intended**, **implemented** and **observed** behavior separate. The code is evidence of current behavior, not proof of correct behavior.

# Phase 2: Personas

Write `shared/personas.md`. Create a persona only when goals, permissions, knowledge, entry point or workflow truly differ; do not add personas that differ only in looks. For each: context, knowledge level, permissions, primary and secondary jobs, entry point (login, invite email, deep link...), required inputs, expected end state, likely failure risks, and **which account signs in as them**. Do not test every persona with an admin account unless that persona is an admin.

# Phase 3: Flows and states

Write `shared/flows.md` with an ID per flow (`F1`, `F2`...):

```
PERSONA -> ENTRY -> ACTION -> SYSTEM RESPONSE -> DECISION -> ... -> SUCCESS STATE
```

For each flow list the start state, prerequisites, decision points, branches, state transitions, cross-user handoffs, success and failure conditions, and retry, cancel and recovery paths. Mark flows with no clear ending. Where the product has workflow states, add a transition map and look for invalid, missing, contradictory, unreachable, stale, duplicate-action and re-entry problems.

# Phase 4: Judgment questions (Jev)

Choose relevant questions from `references/JEV-QUESTION-BANK.md` for each screen and transition, and add product-specific ones. Before asking, fix the persona, job, current state, what is visible, the available choices, the intended next state and the success criteria. Ask specific, testable questions.

If Jev (TypeSafe) is available through MCP, API, SDK or a project integration, use it and keep the exact question, context, output and confidence for material findings. Compare its answer with observed behavior; do not accept it blindly. If Jev is unavailable, label those judgments `JEV NOT EXECUTED` and keep your own analysis clearly separate.

# Phase 5: Test cases

Write `shared/test-cases.md`: ID, persona, job, start state, preconditions, expected path, expected result, judgment questions, failure conditions. For each important flow cover at least: happy path, first-time user, returning user, missing input, wrong input, interruption, browser Back, refresh and re-entry, double submit, failed operation, permission mismatch, empty state, partly finished state, unusual valid input, user changes their mind, deep link or unexpected entry.

# Phase 6: Browser execution (per persona)

Decide the execution mode:

- **Sequential** (default for small apps or when handoffs dominate): the orchestrator runs personas one after another with `browser.mjs`, one `--session` per persona.
- **Parallel**: one sub-agent per persona, briefed with `templates/AGENT-BRIEF.md`. Only parallelize personas whose flows do not mutate the same records, or give each agent its own tenant or fixture set. Cross-user handoff chains run in Phase 7 under one driver.

For every important screen, the tester (you or an agent):

1. **Enters as the real user**, with the right identity, permissions, tenant, data and workflow state, starting where that user really starts: login, invitation, notification link, dashboard. No jumping to internal routes the user could not reach.
2. **Observes before acting.** `browser.mjs ... look` returns a screenshot plus an accessibility snapshot. Read the snapshot for exact controls, and **open the screenshot image** for visual judgment. The accessibility tree alone cannot show hierarchy, overlap, clipping or emphasis. Record the heading, status, visible data, primary and secondary actions, warnings, disabled controls and apparent next step. Ask: *knowing nothing about the implementation, what would this user do next?*
3. **Predicts before material actions**: what a reasonable user expects vs what the product logic says should happen. Then acts, and compares EXPECTED to OBSERVED.
4. **Inspects after acting**: page state, URL, status, messages, new or missing actions, and the console and network errors that `browser.mjs` reports. Check logs and database state when relevant. The UI may not match the real state.
5. **Continues to the business outcome.** A request "sent" is not done until it is saved, the state has changed, the recipient can see it, and a duplicate send behaves correctly.
6. **Writes as it goes.** Append to `notes.md` after every few actions. Write each material finding to `findings/` as soon as it is reproduced; do not batch them to the end. Update `status.json` when each flow finishes. If the agent is interrupted, the notes already on disk are the record.

Test the relevant viewports (`--viewport desktop|mobile|tablet`), looking for hidden calls to action, overflow, clipped text, unusable tables, hover-only controls and modals covering required context.

# Phase 6A: External reality checks (treg)

When a flow claims an effect outside the app (Slack message, analytics event, GTM tag, enrichment, generated media), first do it through the app. Then, if treg is available, verify the effect out-of-band as a second source. Record: app claim, external system, method, observed result, MATCH / PARTIAL / MISMATCH / NOT VERIFIED, and the evidence. Read-only by default, check the cost before any paid call, and never substitute treg for the app's own integration path. See `references/TREG-EXTERNAL-VALIDATION.md`. Without treg, write `EXTERNAL VALIDATION NOT EXECUTED`.

# Phase 7: Cross-user handoffs

Handoffs are first-class flows, and the place parallel runs most often miss bugs. After merging, drive each handoff chain end to end with separate sessions for each side (`--session advisor`, `--session client`). Check that the receiver is notified or can find the work, has context and permission, understands the request, can complete it, and that the workflow returns to the right owner and state. Agents that set up the start of a handoff leave a note in `shared/handoffs/` (record IDs, links, the state left behind) so the chain can be continued.

# Phase 8: Adversarial and interruption testing

Deliberately break assumptions: skip or repeat steps, double submit, two tabs (two `--session`s on one account), refresh mid-flow, Back, log out and in, direct URLs, stale links, a state change from another session, concurrent edits, late or contradictory information, external failure, API success without a UI update, one missing permission, zero data, large data, long abandonment, uncertain model output. Look for state-machine failures, not just broken links.

# Phase 9: Evidence, classification, root cause

**Evidence** must prove or explain something: screenshots and snapshots from `browser.mjs`, URL, visible text, console and network errors, logs, database state, `file:line` references, Jev output. Label each finding **OBSERVED** (verified in the app, logs, database or source), **INFERRED** (strongly suggested but not verified) or **UNKNOWN** (not enough evidence; may itself be a risk).

**Severity** (highest first): BLOCKER, PERMISSION FAILURE, LOGIC FAILURE, STATE FAILURE, DEAD END, RECOVERY FAILURE, MISSING STEP, AMBIGUITY, POOR FEEDBACK, EDGE CASE, REDUNDANT STEP, UX FRICTION, POLISH. Definitions are in `templates/FINDING.md`. Small UI issues must not bury product-critical ones.

**Root cause**: USER OBSERVATION -> SCREEN/ROUTE -> COMPONENT -> STATE/ACTION -> API/SERVER -> DATABASE/EXTERNAL -> CAUSE. Name the layer (UX, information architecture, frontend, backend, state, schema, permissions, API contract, validation, missing state, unclear requirement, copy, third party). Give findings with a shared cause the same `root_cause:` key so `merge.mjs` groups them. Report the underlying problem as the finding and the screen symptoms as its evidence.

# Phase 10: Merge and report

```bash
node <skill-dir>/scripts/merge.mjs --run "$RUN_DIR"
```

Resolve every line under "Merge problems" (an agent not done, missing fields, missing screenshots) before writing the report. Rerun or finish that persona yourself, or mark its flows `UNTESTED`. Then write `report/REPORT.md` from `templates/REPORT-TEMPLATE.md` using the global IDs.

Every major flow gets exactly one verification status: `EXECUTED - PASS`, `EXECUTED - FAIL`, `EXECUTED - PARTIAL`, `CODE-REVIEW ONLY`, `UNTESTED`. Never describe an inferred flow as browser-tested.

# Phase 11: Visual remediation

For material layout, hierarchy or navigation problems, build a packet from `templates/VISUAL-REPAIR-PACKET.md`: actual screenshot, annotated copy (numbered callouts that do not misrepresent the original), judgment, root cause, proposed concept, implementation notes and acceptance test. Use image generation only when a picture explains the fix better, and label every concept `PROPOSED CONCEPT - NOT CURRENT APPLICATION`. Without image generation, write a precise wireframe spec. Fix in this order: business logic, state model, information architecture, flow, layout, polish.

# Phase 12: Fix and retest

Do not fix anything silently during discovery. Reproduce, capture, classify and trace first. Fix only if the assignment authorizes it, and follow the repository's own rules for changes, tests and docs.

Each recommendation includes: problem, user impact, evidence, root cause, recommended change, expected new behavior, acceptance test.

Retest: recreate the original start state (`--fresh` gives a clean profile), rerun the same steps, capture new screenshots, verify the user outcome and downstream state, check for regressions, and record BEFORE / AFTER / PASS | PARTIAL | FAIL. Only the running app counts as proof. A generated concept never does.

---

# Non-negotiable rules

- Never fabricate screenshots, browser results, Jev output, logs, database state or external verification.
- If you have to explain what a screen means, that is evidence the screen is unclear. The explanation does not make it pass.
- Do not overfit to the happy path, and do not let a polished UI excuse a wrong outcome.
- Do not let the code define intended behavior by itself.
- Keep secrets, customer data and bearer links out of notes, screenshots committed anywhere, and reports.
- Separate what ran locally from CI, deployment, provider behavior and real customer outcomes.

# Definition of done

You can answer, with evidence: who uses the app; what each is trying to do; whether each can do it; whether every major flow has a clear start and end; whether transitions are correct; whether users can recover; whether handoffs work; whether permissions match responsibilities; whether real outcomes match intended outcomes; what still breaks; and what must be fixed first. The ledger has no unresolved merge problems, and every flow has a verification status.

# Default start

1. Read repo instructions. 2. Start the app. 3. Run preflight. 4. Write product model, personas, flows, test cases into `shared/`. 5. Choose sequential or parallel. 6. Run the highest-value persona first. 7. Merge, drive handoffs, go adversarial, report. Do not modify code unless the assignment asks for fixes in the same run.
