"use strict";

/**
 * Pure CJS Puppeteer loader — NOT compiled by Next.js/webpack.
 * Loaded from texas-puppeteer-login.ts via dynamic import(pathToFileURL(...).href, { webpackIgnore: true }).
 * All require() for puppeteer-* must stay in this file only.
 */
const { createRequire } = require("module");
const path = require("path");

function resolveModuleFactory(mod, label) {
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.default === "function") return mod.default;
  throw new Error(
    `[puppeteer-runtime] ${label} export is not a function (type=${typeof mod}, keys=${mod && typeof mod === "object" ? Object.keys(mod).join(",") : "n/a"})`
  );
}

function resolveAddExtra(extraMod) {
  if (typeof extraMod.addExtra === "function") return extraMod.addExtra;
  if (extraMod.default && typeof extraMod.default.addExtra === "function") {
    return extraMod.default.addExtra;
  }
  throw new Error(
    `[puppeteer-runtime] puppeteer-extra.addExtra missing (keys=${Object.keys(extraMod || {}).join(",")})`
  );
}

function loadPuppeteerWithDiagnostics() {
  const req = createRequire(path.join(process.cwd(), "package.json"));

  const puppeteerCore = req("puppeteer-core");
  const extraMod = req("puppeteer-extra");
  const stealthMod = req("puppeteer-extra-plugin-stealth");

  const types = {
    puppeteerCore: typeof puppeteerCore,
    extraMod: typeof extraMod,
    extraUse: typeof extraMod.use,
    extraAddExtra: typeof extraMod.addExtra,
    stealthMod: typeof stealthMod,
    stealthDefault: stealthMod && typeof stealthMod.default,
  };

  const addExtra = resolveAddExtra(extraMod);
  const StealthPlugin = resolveModuleFactory(stealthMod, "puppeteer-extra-plugin-stealth");

  const puppeteer = addExtra(puppeteerCore);

  types.puppeteerUse = typeof puppeteer.use;
  types.puppeteerLaunch = typeof puppeteer.launch;

  if (typeof puppeteer.use !== "function") {
    throw new Error(
      `[puppeteer-runtime] puppeteer.use is not a function (typeof=${typeof puppeteer.use})`
    );
  }

  puppeteer.use(StealthPlugin());

  return { puppeteer, types };
}

module.exports = { loadPuppeteerWithDiagnostics };
