/**
 * Puppeteer-based HTML → PNG renderer for Telegram daily reports.
 * Reuses the same browser queue as the Texas session service to avoid
 * running two Chromium instances simultaneously on Railway.
 */
import { withTexasBrowserLoginLock } from "@/lib/texas/texas-browser-queue";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, LaunchOptions } from "puppeteer-core";

const VIEWPORT = { width: 460, height: 900 };
const SCREENSHOT_TIMEOUT_MS = 45_000;

type PuppeteerExtra = {
  launch: (options?: LaunchOptions) => Promise<Browser>;
};

let _puppeteer: PuppeteerExtra | null = null;

async function loadPuppeteer(): Promise<PuppeteerExtra> {
  if (_puppeteer) return _puppeteer;
  const candidates = [
    path.join(process.cwd(), "scripts", "puppeteer-runtime.cjs"),
    path.join(process.cwd(), "..", "scripts", "puppeteer-runtime.cjs"),
  ];
  const loaderPath = candidates.find((p) => existsSync(p));
  if (!loaderPath) throw new Error("[report-renderer] puppeteer-runtime.cjs not found");

  const mod = (await import(
    /* webpackIgnore: true */
    pathToFileURL(loaderPath).href
  )) as { loadPuppeteerWithDiagnostics: () => { puppeteer: PuppeteerExtra } };
  _puppeteer = mod.loadPuppeteerWithDiagnostics().puppeteer;
  return _puppeteer;
}

async function resolveChromiumPath(): Promise<string> {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const candidates = [
    env,
    "/usr/lib/chromium/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  try {
    const { default: p } = await import("puppeteer");
    return p.executablePath();
  } catch {
    throw new Error("[report-renderer] Chromium not found");
  }
}

/** Render an HTML string to a PNG Buffer using headless Chromium. */
export async function screenshotHtmlToPng(html: string): Promise<Buffer> {
  return withTexasBrowserLoginLock(async () => {
    const puppeteer = await loadPuppeteer();
    const executablePath = await resolveChromiumPath();
    const options: LaunchOptions = {
      executablePath,
      headless: true,
      defaultViewport: VIEWPORT,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
      ],
      timeout: SCREENSHOT_TIMEOUT_MS,
    };

    const browser = await puppeteer.launch(options);
    try {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
      await page.waitForSelector("[data-report-ready='true']", {
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
      const card = await page.$("[data-report-root]");
      if (!card) throw new Error("[report-renderer] report element not found");
      const shot = await card.screenshot({ type: "png" });
      return Buffer.from(shot);
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}
