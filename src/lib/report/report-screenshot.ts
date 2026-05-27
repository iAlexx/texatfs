import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, LaunchOptions, Page } from "puppeteer-core";
import { getRenderToken } from "@/lib/cron/auth";
import { withTexasBrowserLoginLock } from "@/lib/texas/texas-browser-queue";

const SCREENSHOT_TIMEOUT_MS = 45_000;
const VIEWPORT = { width: 420, height: 900 };

type PuppeteerExtra = {
  launch: (options?: LaunchOptions) => Promise<Browser>;
};

let cachedPuppeteer: PuppeteerExtra | null = null;

function resolveReportBaseUrl(): string {
  const base =
    process.env.REPORT_RENDER_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://127.0.0.1:${process.env.PORT ?? "3000"}`);

  return base.replace(/\/$/, "");
}

async function loadPuppeteer(): Promise<PuppeteerExtra> {
  if (cachedPuppeteer) return cachedPuppeteer;

  const loaderPath = [
    path.join(process.cwd(), "scripts", "puppeteer-runtime.cjs"),
    path.join(process.cwd(), "..", "scripts", "puppeteer-runtime.cjs"),
  ].find((p) => existsSync(p));

  if (!loaderPath) {
    throw new Error("[report-screenshot] puppeteer-runtime.cjs not found");
  }

  const mod = (await import(
    /* webpackIgnore: true */
    pathToFileURL(loaderPath).href
  )) as {
    loadPuppeteerWithDiagnostics: () => { puppeteer: PuppeteerExtra };
  };

  cachedPuppeteer = mod.loadPuppeteerWithDiagnostics().puppeteer;
  return cachedPuppeteer;
}

async function resolveExecutablePath(): Promise<string> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const candidates = [
    envPath,
    "/usr/lib/chromium/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    const bundled = await import("puppeteer");
    return bundled.default.executablePath();
  } catch {
    throw new Error(
      "[report-screenshot] Chromium not found for report screenshots"
    );
  }
}

async function launchReportBrowser(): Promise<Browser> {
  const puppeteer = await loadPuppeteer();
  const root = process.env.PUPPETEER_USER_DATA_DIR?.trim() || "/tmp/texas-report";
  mkdirSync(root, { recursive: true });
  const userDataDir = mkdtempSync(path.join(root, "profile-"));

  const options: LaunchOptions = {
    executablePath: await resolveExecutablePath(),
    headless: true,
    defaultViewport: VIEWPORT,
    userDataDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--disable-crash-reporter",
      "--disable-breakpad",
      "--window-size=420,900",
    ],
    timeout: SCREENSHOT_TIMEOUT_MS,
    protocolTimeout: SCREENSHOT_TIMEOUT_MS,
  };

  return puppeteer.launch(options);
}

async function captureReportPage(
  page: Page,
  ledgerId: string,
  options?: { mode?: "daily" | "monthly" }
): Promise<Buffer> {
  const modeParam = options?.mode ? `&mode=${encodeURIComponent(options.mode)}` : "";
  const url = `${resolveReportBaseUrl()}/api/render/report/${ledgerId}?token=${encodeURIComponent(getRenderToken())}${modeParam}`;

  await page.goto(url, {
    waitUntil: "networkidle0",
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  await page.waitForSelector("[data-report-ready='true']", {
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  const card = await page.$("[data-report-root]");
  if (!card) {
    throw new Error("[report-screenshot] Report card element not found");
  }

  const shot = await card.screenshot({ type: "png" });
  if (!shot) {
    throw new Error("[report-screenshot] Empty screenshot buffer");
  }

  return Buffer.from(shot);
}

/**
 * Renders /api/render/report/[id] via headless Chromium and returns a PNG buffer.
 * Serialized with Texas login lock to avoid concurrent Chromium on Railway.
 */
export async function captureDailyReportImage(
  ledgerId: string,
  options?: { mode?: "daily" | "monthly" }
): Promise<Buffer> {
  return withTexasBrowserLoginLock(async () => {
    const browser = await launchReportBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      return await captureReportPage(page, ledgerId, options);
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}
