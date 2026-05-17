/**
 * Next.js standalone file tracing omits puppeteer-extra-plugin-stealth/evasions/*.
 * Run after `next build` in Docker to copy the full Puppeteer dependency tree.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcNm = path.join(root, "node_modules");
const destNm = path.join(root, ".next/standalone/node_modules");

if (!fs.existsSync(srcNm)) {
  console.error("[copy-puppeteer] node_modules not found");
  process.exit(1);
}

fs.mkdirSync(destNm, { recursive: true });

function copyPackage(name) {
  const src = path.join(srcNm, name);
  const dest = path.join(destNm, name);
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.info("[copy-puppeteer] copied", name);
  return true;
}

const copied = new Set();
for (const ent of fs.readdirSync(srcNm)) {
  if (ent.startsWith("puppeteer")) {
    copyPackage(ent);
    copied.add(ent);
  }
}

// Transitive deps commonly required by stealth evasions (top-level hoists)
const extra = [
  "deepmerge",
  "debug",
  "ms",
  "merge-deep",
  "clone-deep",
  "kind-of",
  "arr-union",
  "for-in",
  "for-own",
  "is-plain-object",
  "lazy-cache",
  "shallow-clone",
  "is-buffer",
  "isobject",
];

for (const name of extra) {
  if (!copied.has(name)) copyPackage(name);
}

const evasionsDir = path.join(
  destNm,
  "puppeteer-extra-plugin-stealth",
  "evasions",
  "chrome.app"
);
if (!fs.existsSync(evasionsDir)) {
  console.error(
    "[copy-puppeteer] FATAL: stealth evasions/chrome.app missing after copy"
  );
  process.exit(1);
}

const scriptsDir = path.join(root, ".next/standalone/scripts");
fs.mkdirSync(scriptsDir, { recursive: true });
const runtimeSrc = path.join(root, "scripts", "puppeteer-runtime.cjs");
const runtimeDest = path.join(scriptsDir, "puppeteer-runtime.cjs");
if (!fs.existsSync(runtimeSrc)) {
  console.error("[copy-puppeteer] FATAL: scripts/puppeteer-runtime.cjs missing");
  process.exit(1);
}
fs.cpSync(runtimeSrc, runtimeDest, { force: true });
console.info("[copy-puppeteer] copied puppeteer-runtime.cjs");

console.info("[copy-puppeteer] stealth evasions OK");
