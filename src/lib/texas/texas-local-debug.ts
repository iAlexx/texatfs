import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { isLocalDebugMode } from "@/lib/texas/texas-browser-config";

export { isLocalDebugMode };

export function debugLog(phase: string, data?: Record<string, unknown>): void {
  if (!isLocalDebugMode()) return;
  console.info(`[texas-debug] ${phase}`, data ?? {});
}

export function typeDelayMs(): number {
  return isLocalDebugMode() ? 90 : 45;
}

export function stepPauseMs(): number {
  return isLocalDebugMode() ? 800 : 0;
}

export function getTexasDebugDir(): string {
  const dir = path.join(process.cwd(), ".texas-debug");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function logPageState(
  page: Page,
  label: string
): Promise<void> {
  if (!isLocalDebugMode()) return;
  let challenge = false;
  try {
    challenge = await page.evaluate(() => {
      const t = document.title.toLowerCase();
      const b = document.body?.innerText?.toLowerCase() ?? "";
      return (
        t.includes("just a moment") ||
        t.includes("attention required") ||
        b.includes("checking your browser") ||
        b.includes("verify you are human")
      );
    });
  } catch {
    /* page may be navigating */
  }
  const cookies = await page.cookies().catch(() => []);
  debugLog(label, {
    url: page.url(),
    title: await page.title().catch(() => ""),
    challenge,
    cookieNames: cookies.map((c) => c.name).join(","),
  });
}

export async function dumpPageFailure(
  page: Page | undefined,
  label: string,
  error?: unknown
): Promise<void> {
  if (!isLocalDebugMode()) return;
  const dir = getTexasDebugDir();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, "_");
  const base = path.join(dir, `${ts}-${safeLabel}`);

  console.error("[texas-debug] FAILURE", {
    label,
    error: error instanceof Error ? error.message : String(error ?? ""),
  });

  if (!page) return;

  try {
    const meta = {
      url: page.url(),
      title: await page.title(),
    };
    writeFileSync(`${base}.json`, JSON.stringify(meta, null, 2), "utf8");
    console.error("[texas-debug] page meta", meta);
  } catch {
    /* ignore */
  }

  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    console.error("[texas-debug] screenshot", `${base}.png`);
  } catch (e) {
    console.error("[texas-debug] screenshot failed", String(e));
  }

  try {
    const html = await page.content();
    writeFileSync(`${base}.html`, html, "utf8");
    console.error("[texas-debug] html dump", `${base}.html`);
  } catch (e) {
    console.error("[texas-debug] html dump failed", String(e));
  }
}
