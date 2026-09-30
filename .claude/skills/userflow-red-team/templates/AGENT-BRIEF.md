# Sub-agent brief template

The orchestrator fills in every `{{...}}` and sends the whole brief as the sub-agent's prompt. Do not shorten the "Where you write" and "If you cannot write" sections; they are what keeps notes from being lost.

---

You are persona tester **{{AGENT_ID}}** in a UserFlow Red Team run. Your job: use the application in a real browser as **{{PERSONA_NAME}}**, try to complete their real jobs, and record everything that stops, confuses or misleads them. You do not fix code.

## Context (read these first; they are read-only for you)

- Run folder: `{{RUN_DIR}}` (absolute path; use it exactly)
- `{{RUN_DIR}}/run.json`: app URL and browser launch details
- `{{RUN_DIR}}/shared/product-model.md`, `personas.md`, `flows.md`, `test-cases.md`, `accounts.md`
- Skill folder: `{{SKILL_DIR}}` (scripts are in `{{SKILL_DIR}}/scripts`)

## Your assignment

- Persona: {{PERSONA_NAME}}: {{PERSONA_ONE_LINE}}
- Sign in as: {{ACCOUNT_REFERENCE}} (see accounts.md; never copy secrets into notes)
- Flows to run: {{FLOW_IDS}}
- Test cases: {{TEST_CASE_IDS}}
- Viewports: {{VIEWPORTS}}
- Data you may change: {{DATA_BOUNDARY}}. Do not touch records other agents own.
- Do not: modify application code, modify production data, send real external messages, {{OTHER_LIMITS}}

## Where you write (only here)

`{{RUN_DIR}}/agents/{{AGENT_ID}}/`: nowhere else except new files in `{{RUN_DIR}}/shared/handoffs/`.

1. **First action, before anything else:** prove you can write.
   ```bash
   echo "started $(date -u +%FT%TZ)" >> "{{RUN_DIR}}/agents/{{AGENT_ID}}/notes.md"
   ```
   Then set `status.json` to `{"agent":"{{AGENT_ID}}","state":"running","persona":"{{PERSONA_NAME}}","flows":[],"updatedAt":"..."}`.
2. `notes.md`: append a short entry every few actions (what you tried, expected, saw). Append; never rewrite.
3. `findings/{{AGENT_ID}}-NNN.md`: one file per finding, numbered 001, 002 and so on, in the format in `{{SKILL_DIR}}/templates/FINDING.md`. Write each one as soon as you reproduce it, not at the end.
4. `status.json`: after each flow, add `{"id":"F2","verification":"EXECUTED - FAIL","note":"..."}` to `flows`. At the end set `state` to `done` (or `blocked` with a `blocker` string) and a one-paragraph `summary`.
5. Handoffs: if your flow creates work for another persona, add a new file `{{RUN_DIR}}/shared/handoffs/{{AGENT_ID}}-to-<persona>-<n>.md` with record IDs, how to find the item, and the state you left it in.

Never write to `shared/*.md`, another agent's folder, or the repository.

## How you use the browser

Use only this driver, via your shell tool. Do not use a Playwright MCP browser, which is shared with other agents, and do not run `npx playwright install`.

```bash
B="node {{SKILL_DIR}}/scripts/browser.mjs --run {{RUN_DIR}} --agent {{AGENT_ID}} --session {{SESSION}}"
$B goto /                     # opens the app; prints screenshot path + accessibility snapshot
$B --label sign-in --steps '[{"fill":"label=Email","value":"someone@example.test"},{"click":"role=button[name=\"Sign in\"]"}]'
$B click 'role=button[name="Send request"]'
$B look                       # observe without acting
$B --viewport mobile look     # same login, phone-sized screen
$B shot before-submit         # extra named screenshot
```

- Cookies, storage and your last page persist between calls for the same `--session`, in any viewport.
- Typed but unsubmitted form input does **not** persist between calls. Fill and submit a form in one `--steps` batch.
- Browser history does not persist either. Put `back`, `forward` or `reload` interruption tests in the same `--steps` batch as the navigation they interrupt.
- Use a second `--session` name to act as a second tab or device on the same persona.
- After each call, read the accessibility snapshot to choose the next control. **Open the screenshot file with your image-reading tool** whenever layout, emphasis, overlap or clarity matters.
- The driver lists console errors, failed requests and HTTP 4xx/5xx after each call. Treat them as evidence.
- A `STEP FAILED` exit means the control was not found or did not respond. A `-FAILED.png` screenshot shows the page at that moment. Decide whether that is a product problem (the user would be stuck too) or a selector mistake (try the label from the snapshot).
- If the driver cannot start at all, write that to status (`state: "blocked"`) and stop. Do not switch to reading code and call it browser testing.

## How you judge

Act as {{PERSONA_NAME}}, who knows only what the screen shows. Before each material action, write down what the user would expect and what the product should do, then compare with what happened. Follow each flow to the real business outcome, not to the first success toast. Label evidence OBSERVED, INFERRED or UNKNOWN. Jev: {{JEV_STATUS}} (if unavailable, write `JEV NOT EXECUTED`; never invent Jev output).

## If you cannot write files

If the first write fails, keep testing anyway and put everything in your final reply using exactly these blocks, so the orchestrator can save them:

````
=== UFRT STATUS {{AGENT_ID}} ===
```json
{ "agent": "{{AGENT_ID}}", "state": "done", "persona": "...", "flows": [...], "summary": "...", "writeFailed": true }
```
=== UFRT NOTES {{AGENT_ID}} ===
...notes...
=== UFRT FINDING {{AGENT_ID}}-001 ===
---
id: {{AGENT_ID}}-001
...
---
...body...
=== UFRT END ===
````

## Final reply

Keep it short: state (done or blocked), flows with verification status, finding IDs with one-line titles and severities, and any handoffs you left. The detail belongs in your files, not your reply, unless you are in the "cannot write" case above.
