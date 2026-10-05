#!/usr/bin/env node
// Merge every sub-agent's notes into one ledger. Only the orchestrator runs this.
//
// Reads (never edits) <run>/agents/*/status.json and <run>/agents/*/findings/*.md,
// plus <run>/shared/handoffs/*.md. Writes <run>/report/ledger.md, ledger.json and
// id-map.json. Agent-local finding ids (A1-003) become global ids (UFR-001...)
// ordered by severity, so parallel agents never collide on numbering.
//
// Usage: node merge.mjs --run <RUN_DIR>
import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, writeJson, die } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const runDir = args.run && path.resolve(args.run);
if (!runDir || !fs.existsSync(path.join(runDir, "run.json")))
  die("--run must point at a run directory created by preflight.mjs");

const SEVERITY = [
  "BLOCKER",
  "PERMISSION FAILURE",
  "LOGIC FAILURE",
  "STATE FAILURE",
  "DEAD END",
  "RECOVERY FAILURE",
  "MISSING STEP",
  "AMBIGUITY",
  "POOR FEEDBACK",
  "EDGE CASE",
  "REDUNDANT STEP",
  "UX FRICTION",
  "POLISH",
];
const rank = (s) => {
  const i = SEVERITY.indexOf(String(s || "").toUpperCase());
  return i < 0 ? SEVERITY.length : i;
};

function parseFinding(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (m)
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (kv) meta[kv[1].toLowerCase()] = kv[2].trim();
    }
  return { meta, body: (m ? m[2] : raw).trim(), file };
}

const agentsDir = path.join(runDir, "agents");
const agentIds = fs.existsSync(agentsDir)
  ? fs
      .readdirSync(agentsDir)
      .filter((d) => fs.statSync(path.join(agentsDir, d)).isDirectory())
      .sort()
  : [];
const agents = [],
  findings = [],
  problems = [];

for (const id of agentIds) {
  const dir = path.join(agentsDir, id);
  const status = readJson(path.join(dir, "status.json"));
  if (!status) problems.push(`${id}: no readable status.json`);
  else if (status.state !== "done")
    problems.push(
      `${id}: state is "${status.state}" (not done)${status.blocker ? ` - ${status.blocker}` : ""}`,
    );
  const fdir = path.join(dir, "findings");
  const files = fs.existsSync(fdir)
    ? fs
        .readdirSync(fdir)
        .filter((f) => f.endsWith(".md"))
        .sort()
    : [];
  for (const f of files) {
    const fnd = parseFinding(path.join(fdir, f));
    fnd.agent = id;
    fnd.localId = fnd.meta.id || `${id}-${path.basename(f, ".md")}`;
    for (const req of ["title", "severity", "evidence", "persona"])
      if (!fnd.meta[req]) problems.push(`${fnd.localId}: missing "${req}"`);
    for (const shot of (fnd.meta.screenshots || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const abs = path.isAbsolute(shot) ? shot : path.join(dir, shot);
      if (!fs.existsSync(abs))
        problems.push(`${fnd.localId}: screenshot not found: ${shot}`);
    }
    findings.push(fnd);
  }
  agents.push({ id, status, findingCount: files.length });
}

findings.sort(
  (a, b) =>
    rank(a.meta.severity) - rank(b.meta.severity) ||
    a.localId.localeCompare(b.localId),
);
const idMap = {};
findings.forEach((f, i) => {
  f.id = `UFR-${String(i + 1).padStart(3, "0")}`;
  idMap[f.localId] = f.id;
});

const handoffDir = path.join(runDir, "shared", "handoffs");
const handoffs = fs.existsSync(handoffDir)
  ? fs
      .readdirSync(handoffDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
  : [];

const flows = [];
for (const a of agents)
  for (const fl of a.status?.flows || []) flows.push({ agent: a.id, ...fl });

const groups = {};
for (const f of findings) {
  const key = f.meta.root_cause || "(ungrouped)";
  (groups[key] ||= []).push(f.id);
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
const lines = [];
lines.push(
  `# Findings ledger - run ${path.basename(runDir)}`,
  "",
  `Generated ${new Date().toISOString()} by merge.mjs. Source files are the agents' own; do not edit them here.`,
  "",
);
lines.push(
  "## Agents",
  "",
  "| Agent | Persona | State | Findings | Summary |",
  "|---|---|---|---|---|",
);
for (const a of agents)
  lines.push(
    `| ${a.id} | ${esc(a.status?.persona)} | ${esc(a.status?.state || "MISSING")} | ${a.findingCount} | ${esc(a.status?.summary)} |`,
  );
lines.push(
  "",
  "## Flow coverage",
  "",
  "| Agent | Flow | Verification | Note |",
  "|---|---|---|---|",
);
for (const f of flows)
  lines.push(
    `| ${f.agent} | ${esc(f.id || f.name)} | ${esc(f.verification)} | ${esc(f.note)} |`,
  );
lines.push(
  "",
  "## Findings",
  "",
  "| ID | Local ID | Severity | Evidence | Persona | Location | Title |",
  "|---|---|---|---|---|---|---|",
);
for (const f of findings)
  lines.push(
    `| ${f.id} | ${f.localId} | ${esc(f.meta.severity)} | ${esc(f.meta.evidence)} | ${esc(f.meta.persona)} | ${esc(f.meta.location)} | ${esc(f.meta.title)} |`,
  );
lines.push("", "## Candidate root-cause groups", "");
for (const [k, ids] of Object.entries(groups))
  lines.push(`- **${k}**: ${ids.join(", ")}`);
lines.push("", "## Cross-agent handoff notes", "");
lines.push(
  ...(handoffs.length
    ? handoffs.map((h) => `- shared/handoffs/${h}`)
    : ["- none"]),
);
lines.push("", "## Merge problems", "");
lines.push(...(problems.length ? problems.map((p) => `- ${p}`) : ["- none"]));
lines.push("", "## Finding details", "");
for (const f of findings)
  lines.push(
    `### ${f.id} (${f.localId}) - ${f.meta.title}`,
    "",
    `Source: ${path.relative(runDir, f.file)}`,
    "",
    f.body,
    "",
  );

fs.mkdirSync(path.join(runDir, "report"), { recursive: true });
fs.writeFileSync(path.join(runDir, "report", "ledger.md"), lines.join("\n"));
writeJson(path.join(runDir, "report", "ledger.json"), {
  agents,
  flows,
  findings: findings.map(({ body, ...f }) => ({ ...f, body })),
  groups,
  handoffs,
  problems,
});
writeJson(path.join(runDir, "report", "id-map.json"), idMap);

console.log(
  `agents: ${agents.length}  findings: ${findings.length}  flows: ${flows.length}  handoffs: ${handoffs.length}`,
);
console.log(`ledger: ${path.join(runDir, "report", "ledger.md")}`);
if (problems.length) {
  console.log(`merge problems (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);
}
