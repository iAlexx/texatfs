/**
 * Merges puppeteer + transitive deps from prod-node_modules into app node_modules.
 * Docker runner stage: prod deps are in ./prod-node_modules, app in ./node_modules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcNm = path.join(appRoot, "prod-node_modules");
const destNm = path.join(appRoot, "node_modules");

if (!fs.existsSync(srcNm)) {
  console.error("[copy-puppeteer-runner] prod-node_modules not found");
  process.exit(1);
}

function readPkg(nmRoot, name) {
  const pkgPath = path.join(nmRoot, name, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

function collectTransitivePackageNames(nmRoot, seedNames) {
  const queue = [...seedNames];
  const seen = new Set();

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || seen.has(name)) continue;
    if (!fs.existsSync(path.join(nmRoot, name))) continue;

    seen.add(name);
    const pkg = readPkg(nmRoot, name);
    if (!pkg) continue;

    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const dep of Object.keys(deps)) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }

  return seen;
}

const seeds = fs.readdirSync(srcNm).filter((e) => e.startsWith("puppeteer"));
const all = collectTransitivePackageNames(srcNm, seeds);

fs.mkdirSync(destNm, { recursive: true });

for (const name of all) {
  const src = path.join(srcNm, name);
  const dest = path.join(destNm, name);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, dest, { recursive: true, force: true });
}

for (const required of ["fs-extra", "puppeteer-extra-plugin-user-data-dir"]) {
  if (!fs.existsSync(path.join(destNm, required, "package.json"))) {
    console.error("[copy-puppeteer-runner] FATAL: missing", required);
    process.exit(1);
  }
}

const evasions = path.join(
  destNm,
  "puppeteer-extra-plugin-stealth",
  "evasions",
  "chrome.app"
);
if (!fs.existsSync(evasions)) {
  console.error("[copy-puppeteer-runner] FATAL: stealth evasions missing");
  process.exit(1);
}

console.info("[copy-puppeteer-runner] merged", { packages: all.size });
