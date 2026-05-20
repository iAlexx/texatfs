/**
 * WhatsApp Daily Report: generate image + send to all 🔥 groups.
 * Uses existing Puppeteer infrastructure (withTexasBrowserLoginLock).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTexasBrowserLoginLock } from "@/lib/texas/texas-browser-queue";
import { renderWhatsAppReportHtml, type WhatsAppReportData } from "@/lib/whatsapp/render-whatsapp-report-html";
import {
  getFireGroupsFromDb,
  syncAndGetFireGroups,
  markReportSent,
} from "@/lib/whatsapp/group-scanner";
import { getEvolutionClient } from "@/lib/whatsapp/evolution-client";
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
  if (!loaderPath) throw new Error("[report-sender] puppeteer-runtime.cjs not found");

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
    throw new Error("[report-sender] Chromium not found");
  }
}

/** Render WhatsApp report HTML → PNG buffer via headless Chromium. */
async function screenshotReportHtml(html: string): Promise<Buffer> {
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
        waitUntil: "networkidle0",
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
      await page.waitForSelector("[data-report-ready='true']", {
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
      const card = await page.$("[data-report-root]");
      if (!card) throw new Error("[report-sender] report element not found");
      const shot = await card.screenshot({ type: "png" });
      return Buffer.from(shot);
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}

export interface SendReportResult {
  instanceName: string;
  groupsSent: string[];
  groupsFailed: { jid: string; error: string }[];
}

/**
 * Main entry: generate report image and send to all 🔥 groups for one instance.
 * If forceResync = true, re-fetches groups from Evolution API first.
 */
export async function sendDailyReportToFireGroups(
  supabase: SupabaseClient,
  params: {
    instanceId: string;
    instanceName: string;
    userId: string;
    reportData: WhatsAppReportData;
    forceResync?: boolean;
  }
): Promise<SendReportResult> {
  const { instanceId, instanceName, userId, reportData } = params;

  // Fetch 🔥 groups (resync from Evolution API once per cron run)
  const groups = params.forceResync
    ? await syncAndGetFireGroups(supabase, instanceId, instanceName, userId)
    : await getFireGroupsFromDb(supabase, instanceId);

  if (!groups.length) {
    console.info(
      `[report-sender] no 🔥 groups for instance ${instanceName}`
    );
    return { instanceName, groupsSent: [], groupsFailed: [] };
  }

  // Generate image once, reuse for all groups
  const html = renderWhatsAppReportHtml(reportData);
  let imageBuffer: Buffer;
  try {
    imageBuffer = await screenshotReportHtml(html);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[report-sender] screenshot failed", msg);
    return {
      instanceName,
      groupsSent: [],
      groupsFailed: groups.map((g) => ({ jid: g.group_jid, error: msg })),
    };
  }

  const evo = getEvolutionClient();
  const groupsSent: string[] = [];
  const groupsFailed: { jid: string; error: string }[] = [];
  const caption = `📊 التقرير اليومي — ${reportData.ledgerDate}\n🔥 Texas Funds`;

  for (const group of groups) {
    try {
      await evo.sendImageToGroup(
        instanceName,
        group.group_jid,
        imageBuffer,
        caption
      );
      await markReportSent(supabase, instanceId, group.group_jid);
      groupsSent.push(group.group_jid);
      console.info(
        `[report-sender] sent to group "${group.group_name}" (${group.group_jid})`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      groupsFailed.push({ jid: group.group_jid, error: msg });
      console.error(
        `[report-sender] failed group ${group.group_jid}:`,
        msg
      );
    }
  }

  return { instanceName, groupsSent, groupsFailed };
}
