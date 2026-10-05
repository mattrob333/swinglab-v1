// Shared helpers for the UserFlow Red Team scripts. No dependencies beyond Node >= 18
// and an installed `playwright` package (project-local or global).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Flags that never take a value, so `--fresh goto /` is not read as fresh="goto".
const BOOLEAN_FLAGS = new Set([
  "fresh",
  "full",
  "no-look",
  "no-browser",
  "help",
]);

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (BOOLEAN_FLAGS.has(key) || next === undefined || next.startsWith("--"))
        out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

export function die(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

// Resolve the playwright package without ever running `npx playwright install`
// (which downloads a mismatched version and browsers in sandboxed containers).
export function loadPlaywright(cwd = process.cwd()) {
  const tried = [];
  const bases = [cwd, path.resolve(cwd, "node_modules")];
  try {
    bases.push(
      execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim(),
    );
  } catch {}
  for (const base of bases) {
    for (const name of ["playwright", "playwright-core", "@playwright/test"]) {
      try {
        const req = createRequire(path.join(base, "noop.js"));
        const mod = req(name);
        if (mod.chromium)
          return {
            pw: mod,
            source: `${name} via ${base}`,
            version: safeVersion(req, name),
          };
      } catch (e) {
        tried.push(`${name}@${base}`);
      }
    }
  }
  return { pw: null, source: null, tried };
}

function safeVersion(req, name) {
  try {
    return req(`${name}/package.json`).version;
  } catch {
    return "unknown";
  }
}

// Candidate Chromium executables when the default launch fails because the
// installed browser revision does not match the playwright package version.
export function chromiumCandidates() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/opt/pw-browsers",
    path.join(process.env.HOME || "/root", ".cache/ms-playwright"),
  ].filter(Boolean);
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root).sort().reverse()) {
      for (const rel of [
        "chrome-linux/chrome",
        "chrome-linux/headless_shell",
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-win/chrome.exe",
      ]) {
        const p = path.join(root, dir, rel);
        if (fs.existsSync(p)) found.push(p);
      }
    }
    const direct = path.join(root, "chromium");
    if (fs.existsSync(direct) && fs.statSync(direct).isFile())
      found.push(direct);
  }
  for (const p of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ]) {
    if (fs.existsSync(p)) found.push(p);
  }
  return [...new Set(found)];
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic replace so readers never see half a file
}

export function appendLine(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
};

export function safeName(s) {
  return (
    String(s)
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "x"
  );
}
