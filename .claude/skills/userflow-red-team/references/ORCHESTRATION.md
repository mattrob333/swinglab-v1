# Orchestrating persona sub-agents

Read this before dispatching any sub-agent. It covers the failures seen in earlier runs: agents that could not write to a common place, notes that overwrote each other, colliding finding IDs, and agents fighting over one browser.

## When to use sub-agents

Use parallel persona agents when there are three or more personas with mostly independent flows and the app has enough separate test data (accounts, tenants, records) that one agent's actions do not change another's starting state. Otherwise run personas sequentially yourself with `browser.mjs`. The rest of the method is the same.

Cross-user handoff chains (A creates, B responds, A continues) are not split across parallel agents. Either one agent owns the whole chain with two `--session`s, or the orchestrator drives it in Phase 7 after the merge.

## Dispatch checklist

1. `preflight.mjs --url <app> --agents A1,A2,...` succeeded and printed `browser: ok`. Keep the absolute `RUN_DIR`.
2. `shared/product-model.md`, `personas.md`, `flows.md`, `test-cases.md`, `accounts.md` are written. Agents read these; they do not rediscover the product.
3. Each agent has a disjoint data boundary: its own account, tenant, or named records. Write the boundary into the brief.
4. Fill `templates/AGENT-BRIEF.md` completely for each agent. Use absolute paths for `RUN_DIR` and `SKILL_DIR`.
5. Choose an agent type that can run shell commands and write files. In Claude Code that is `general-purpose` (not `Explore` or `Plan`, which are read-only). Do **not** set worktree isolation: the run folder must be the same physical folder for everyone.
6. Launch agents in one message so they run concurrently. Keep the number modest (about 3-5); every agent runs its own Chromium.
7. While they run, do not edit their folders. You may read `agents/*/notes.md` and `status.json` to check progress.

## Why each rule exists

| Failure seen | Cause | Rule |
|---|---|---|
| Agent notes never reached the orchestrator | Agent wrote relative paths from its own working directory, or into a worktree copy | Absolute `RUN_DIR`; no worktree isolation |
| Agent "could not write" | Read-only agent type, or file writes were blocked for background agents | Writable agent type; write test as first action; return-message fallback |
| Notes from one agent erased another's | Several agents writing one shared notes file | One writer per file; agents own `agents/<ID>/` only |
| Two different `UFR-001`s | Each agent numbered globally | Agent-local IDs; `merge.mjs` assigns global IDs |
| Agents logged in as the wrong user, pages changed underneath them | One shared Playwright MCP browser | `browser.mjs` with a per-agent, per-session profile |
| Agents burned their turn installing browsers | `npx playwright install` in a sandbox | Preflight finds the installed package and browser; never install at runtime |
| "Browser tested" with no screenshots | Agent fell back to code reading silently | Driver failure means `state: blocked`, and code-only flows are labeled `CODE-REVIEW ONLY` |

## When an agent returns

1. Read its short reply.
2. If the reply contains `=== UFRT STATUS`, `=== UFRT NOTES` or `=== UFRT FINDING` blocks, it could not write. Save each block into `agents/<ID>/` yourself (`status.json`, `notes.md`, `findings/<ID>-NNN.md`) exactly as given, adding `"recoveredFromReply": true` to status.
3. If an agent ended without `state: "done"` and without blocks, its folder still holds whatever it wrote along the way. Decide whether to resume it (continue the same agent if your tool supports that), rerun that persona, or mark the remaining flows `UNTESTED`.

## Merge

```bash
node <SKILL_DIR>/scripts/merge.mjs --run "$RUN_DIR"
```

Output: `report/ledger.md` (agents, flow coverage, findings sorted by severity with global `UFR-###` IDs, root-cause groups, handoff notes, finding bodies), `ledger.json`, and `id-map.json` (local to global IDs). Fix everything listed under "Merge problems" and re-run the merge until it is clean. Then:

- deduplicate: when two agents found the same underlying problem, keep one finding and cite the other's evidence
- regroup `root_cause` slugs where agents named the same cause differently
- drive the handoff chains listed in `shared/handoffs/`
- write `report/REPORT.md` using global IDs only

## Sequential mode

The same folder layout works with no sub-agents: use agent ID `A0` (or one ID per persona), run `browser.mjs` yourself with one `--session` per persona, write findings in the same format, and still run `merge.mjs` to get the ledger and coverage table.
