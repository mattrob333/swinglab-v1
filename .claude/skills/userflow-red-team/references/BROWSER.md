# Browser execution

## Which tool

| Situation | Use |
|---|---|
| Parallel sub-agents | `scripts/browser.mjs` only, one `--agent` and `--session` each |
| Orchestrator alone, exploratory | `browser.mjs` (preferred: evidence lands in the run folder), or Playwright MCP if configured |
| Repeatable regression / retest | `browser.mjs --steps-file`, or the repository's own Playwright/Cypress suite |
| No browser can launch | Label flows `CODE-REVIEW ONLY`; do not describe them as tested |

Playwright MCP runs one browser for the whole session. Two agents using it share tabs, cookies and navigation, so their evidence is unreliable. Sub-agents also do not always receive MCP tools. `browser.mjs` avoids both problems because it is an ordinary script any agent with a shell can run.

## Setup facts

- `browser.mjs` and `preflight.mjs` need Node 18+ and the `playwright` package, found in the project's `node_modules` or the global npm root. They never download anything.
- Do **not** run `npx playwright install` or `npx playwright@latest` in a sandboxed container. It pulls a Playwright version whose browser revision does not match the pre-installed browsers, often without network access, and wastes the agent's turn.
- If the default launch fails, preflight tries the browsers under `$PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers`, `~/.cache/ms-playwright` and system Chromium, and stores the working `executablePath` in `run.json`. `browser.mjs` reuses it.
- Always headless; containers have no display. `--no-sandbox` is passed for root containers.
- If the app runs on the same machine, use `http://127.0.0.1:<port>` or `localhost`. Start the dev server in the background before preflight, and confirm it answers.

## Driver reference

```
node browser.mjs --run <RUN_DIR> --agent <ID> --session <persona> [--viewport desktop|laptop|tablet|mobile]
                 [--label name] [--full] [--no-look] [--timeout ms] [--fresh] [--max-lines N]
                 <verb> [args]   |   --steps '<json array>'   |   --steps-file file.json
```

| Verb | Example |
|---|---|
| goto | `goto /login` (relative to the app URL in run.json) or a full URL |
| look | observe only |
| click | `click 'role=button[name="Send request"]'` |
| fill | `fill 'label=Email' 'ana@example.test'` |
| press | `press Enter` |
| select | `select 'label=Role' manager` |
| check / hover | `check 'label=I agree'` |
| back / forward / reload | browser navigation (interruption tests) |
| wait | `wait 1500` or `wait 'text=Saved'` |
| shot | `shot after-submit` (extra named screenshot) |
| text | `text 'role=status'` prints inner text |
| eval | `eval 'localStorage.length'` (read-only inspection; do not use it to drive the UI a user could not) |
| reset | wipe this session's profile (fresh first-time user) |

Selectors: Playwright's own (`role=button[name="Save"]`, `text=Save`, `#id`, `css=...`, `xpath=...`) plus shorthands the driver adds: `label=Email`, `placeholder=Search`, `testid=submit`, `alt=Logo`, `title=Close`. The first match is used; `text=Sign in` also matches a heading that says "Sign in", so prefer `role=` for controls.

Steps JSON uses the same keys: `[{"goto":"/"},{"fill":"label=Email","value":"a@b.test"},{"click":"role=button[name=\"Sign in\"]"},{"shot":"signed-in"}]`.

Every call ends with an automatic look: a screenshot in `agents/<ID>/screens/NNN-<session>-<viewport>[-label].png`, an accessibility snapshot `.aria.yml` next to it, and the console errors, page errors, failed requests, HTTP 4xx/5xx and dialogs seen during the call. Every call is logged to `agents/<ID>/actions.jsonl`. Exit code 3 means a step failed; the screenshot is suffixed `-FAILED`.

## Sessions and state

- A profile is keyed by agent + session. Cookies (including session cookies, which the driver saves and restores itself), localStorage and the last URL persist between calls, so a login survives. The viewport is applied per call, so the same logged-in persona can be checked on desktop and then mobile.
- Each call is a separate browser process. **Typed but unsubmitted form input, sessionStorage and browser history do not persist.** Fill and submit a form in one `--steps` batch. Put Back/Forward interruption tests in the same batch as the navigation they undo; the driver refuses `back`/`forward` as the first step of a call rather than silently landing on a blank page.
- Two sessions for the same persona give you two tabs or devices: use them for concurrent edits, stale tabs and double submits.
- One process per profile at a time; the driver refuses a second concurrent call on the same profile and says so.
- `--fresh` or `reset` wipes the profile for first-time-user and retest-from-clean runs.
- Browser dialogs (`alert`, `confirm`) are recorded as events and dismissed. If a flow depends on accepting a confirm, note it as a finding candidate and drive that step through the repository's test tools.

## Visual judgment

The accessibility snapshot is for choosing controls exactly. It cannot show visual hierarchy, contrast, overlap, clipping, or what draws the eye. For any judgment about clarity or layout, open the PNG with the agent's image-reading tool and look at it. Test at least desktop and mobile for flows used on phones.

## Selector tips

Take names from the snapshot: `- button "Send request"` becomes `role=button[name="Send request"]`; `- textbox "Email"` becomes `label=Email` or `role=textbox[name="Email"]`. Prefer role, label and text selectors over CSS: if a user cannot find the control by its visible name, that is itself a finding.
