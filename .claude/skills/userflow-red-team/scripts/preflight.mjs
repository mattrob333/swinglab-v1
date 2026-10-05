#!/usr/bin/env node
// Preflight for a UserFlow Red Team run. The orchestrator runs this ONCE before
// dispatching any sub-agent. It proves, instead of assuming, that:
//   1. a shared run directory exists at an absolute path and is writable,
//   2. each planned agent folder exists and is writable,
//   3. a headless Chromium can launch, load the target URL, and save a screenshot
//      into the run directory.
// Results go to <run>/run.json, which every sub-agent brief points at.
//
// Usage:
//   node preflight.mjs --url http://localhost:5173 [--root <dir>] [--run-id <id>]
//                      [--agents A1,A2,A3] [--no-browser]
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  parseArgs,
  loadPlaywright,
  chromiumCandidates,
  writeJson,
  die,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || gitRoot() || process.cwd());
const runId =
  args["run-id"] || new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = path.join(root, ".userflow-redteam", "runs", runId);
const agents = String(args.agents || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const report = {
  runId,
  runDir,
  root,
  createdAt: new Date().toISOString(),
  url: args.url || null,
  checks: {},
  agents: {},
};

function gitRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// 1. Run directory + write probe
try {
  for (const sub of ["agents", "shared", "report", "artifacts"])
    fs.mkdirSync(path.join(runDir, sub), { recursive: true });
  const probe = path.join(runDir, "shared", ".write-probe");
  fs.writeFileSync(probe, "ok");
  fs.rmSync(probe);
  report.checks.runDirWritable = true;
} catch (e) {
  die(`run directory not writable: ${runDir}: ${e.message}`);
}

const gi = path.join(root, ".gitignore");
const ignored =
  fs.existsSync(gi) &&
  /^\/?\.userflow-redteam\/?$/m.test(fs.readFileSync(gi, "utf8"));
report.checks.gitignored = ignored;

for (const id of agents) {
  const dir = path.join(runDir, "agents", id);
  for (const sub of ["findings", "screens", "profiles"])
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  writeJson(path.join(dir, "status.json"), {
    agent: id,
    state: "assigned",
    updatedAt: new Date().toISOString(),
  });
  report.agents[id] = { dir };
}

// 2. Browser launch + screenshot probe
if (!args["no-browser"]) {
  const { pw, source, version, tried } = loadPlaywright(root);
  if (!pw) {
    report.checks.browser = {
      ok: false,
      reason:
        "playwright package not found (install it locally or globally; do not rely on npx downloads)",
      tried,
    };
  } else {
    report.checks.browser = { ok: false, playwright: source, version };
    const attempts = [
      { label: "default" },
      ...chromiumCandidates().map((p) => ({ label: p, executablePath: p })),
    ];
    for (const att of attempts) {
      let browser;
      try {
        browser = await pw.chromium.launch({
          headless: true,
          executablePath: att.executablePath,
          args: ["--no-sandbox"],
        });
        const page = await browser.newPage();
        const target = args.url || "about:blank";
        const resp =
          target === "about:blank"
            ? null
            : await page.goto(target, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
              });
        const shot = path.join(runDir, "shared", "preflight.png");
        await page.screenshot({ path: shot });
        report.checks.browser = {
          ok: true,
          playwright: source,
          version,
          launch: att.label,
          executablePath: att.executablePath || null,
          status: resp ? resp.status() : null,
          title: await page.title(),
          screenshot: shot,
        };
        await browser.close();
        break;
      } catch (e) {
        report.checks.browser.lastError = `${att.label}: ${e.message.split("\n")[0]}`;
        if (browser) await browser.close().catch(() => {});
      }
    }
  }
}

writeJson(path.join(runDir, "run.json"), report);

const b = report.checks.browser;
console.log(`RUN_DIR=${runDir}`);
console.log("run dir writable: yes");
console.log(
  `gitignored: ${ignored ? "yes" : 'NO - add ".userflow-redteam/" to .gitignore before committing anything'}`,
);
if (b)
  console.log(
    b.ok
      ? `browser: ok (${b.playwright} ${b.version}, launch=${b.launch}, http ${b.status ?? "-"}, screenshot ${b.screenshot})`
      : `browser: FAILED - ${b.reason || b.lastError}`,
  );
for (const id of agents) console.log(`agent ${id}: ${report.agents[id].dir}`);
if (b && !b.ok) process.exit(2);
