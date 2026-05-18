/**
 * Next.js standalone file tracing omits puppeteer-extra-plugin-stealth/evasions/*
 * and transitive deps (fs-extra, rimraf, …). Run after `next build` in Docker.
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

function readPkg(nmRoot, name) {
  const pkgPath = path.join(nmRoot, name, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

/** Walk puppeteer-* packages + all npm dependencies (fs-extra, rimraf, …). */
function collectTransitivePackageNames(seedNames) {
  const queue = [...seedNames];
  const seen = new Set();

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || seen.has(name)) continue;
    if (!fs.existsSync(path.join(srcNm, name))) continue;

    seen.add(name);
    const pkg = readPkg(srcNm, name);
    if (!pkg) continue;

    const deps = {
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
    };
    for (const dep of Object.keys(deps)) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }

  return seen;
}

function copyPackage(name) {
  const src = path.join(srcNm, name);
  const dest = path.join(destNm, name);
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.info("[copy-puppeteer] copied", name);
  return true;
}

const puppeteerSeeds = fs
  .readdirSync(srcNm)
  .filter((ent) => ent.startsWith("puppeteer"));

const allPackages = collectTransitivePackageNames(puppeteerSeeds);
console.info("[copy-puppeteer] package count", allPackages.size);

for (const name of allPackages) {
  copyPackage(name);
}

const required = ["fs-extra", "puppeteer-extra-plugin-user-data-dir"];
for (const name of required) {
  if (!fs.existsSync(path.join(destNm, name, "package.json"))) {
    console.error("[copy-puppeteer] FATAL: missing required package", name);
    process.exit(1);
  }
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
console.info("[copy-puppeteer] stealth evasions + transitive deps OK");
