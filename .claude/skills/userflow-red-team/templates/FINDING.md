# Finding file format

One file per finding: `agents/<ID>/findings/<ID>-NNN.md`. The header between `---` lines is read by `merge.mjs`; keep keys lowercase, one per line, values on the same line.

```markdown
---
id: A2-003
title: Sent request still shows "Send" as the primary action after refresh
severity: STATE FAILURE
evidence: OBSERVED
persona: Advisor
flow: F2
test: TC-F2-08
location: /companies/:id/discovery
root_cause: missing-waiting-for-client-state
screenshots: screens/014-advisor-desktop.png, screens/015-advisor-desktop-after-refresh.png
jev: JEV NOT EXECUTED
---

**Steps to reproduce** (from the persona's real entry point)
1. ...

**Expected (user)**: ...
**Expected (product logic)**: ...
**Observed**: ...

**User impact**: ...

**Evidence**: screenshot paths, console/network lines from the driver, log lines, `file:line`.

**Likely root cause**: layer + reasoning. Mark INFERRED if not verified in code.

**Suggested fix**: smallest change.
**Acceptance test**: Given / when / then, runnable by the retest.
```

`screenshots:` paths are relative to the agent folder (or absolute). `root_cause:` is a short slug; findings that share one are grouped in the ledger. The orchestrator may rename slugs to merge groups.

## Severity definitions

| Severity | Meaning |
|---|---|
| BLOCKER | The user cannot complete the intended job. |
| PERMISSION FAILURE | The wrong user can, or the right user cannot, see or do something. |
| LOGIC FAILURE | The app allows or requires behavior inconsistent with the intended workflow. |
| STATE FAILURE | Displayed or stored state is wrong, stale or contradictory. |
| DEAD END | The user reaches a state with no valid way forward. |
| RECOVERY FAILURE | Something fails and there is no reasonable way to recover. |
| MISSING STEP | The workflow omits something required to finish. |
| AMBIGUITY | A reasonable user cannot reliably tell what to do. |
| POOR FEEDBACK | The system acts but does not clearly say what happened. |
| EDGE CASE | The normal flow works; a realistic variation breaks it. |
| REDUNDANT STEP | Unnecessary human work. |
| UX FRICTION | Works, but with needless effort or cognitive load. |
| POLISH | Minor visual or copy issue that does not affect completion. |

Evidence labels: **OBSERVED** (verified in the running app, logs, database or source), **INFERRED** (strongly suggested, not verified), **UNKNOWN** (not enough evidence; may itself be a risk).
