import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { isRailwayRuntime } from "@/lib/texas/texas-browser-config";
import { getPuppeteerSyncStatus } from "@/lib/texas/puppeteer-resilience";
import {
  getScraperCircuitStatus,
  resetScraperCircuit,
} from "@/lib/scraper/stable-scraper-wrapper";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET() {
  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const puppeteerRuntime = existsSync(
    `${process.cwd()}/scripts/puppeteer-runtime.cjs`
  );

  const puppeteerSync = getPuppeteerSyncStatus();

  return NextResponse.json({
    status: "ok",
    service: "texas-funds-calculate",
    timestamp: new Date().toISOString(),
    railway: isRailwayRuntime(),
    puppeteer: {
      executablePath: chromiumPath ?? null,
      chromiumOnDisk: chromiumPath ? existsSync(chromiumPath) : false,
      runtimeLoader: puppeteerRuntime,
      sync: {
        lastSuccessAt: puppeteerSync.lastSuccessAt,
        lastErrorAt: puppeteerSync.lastErrorAt,
        lastErrorType: puppeteerSync.lastErrorType,
        lastErrorMessage: puppeteerSync.lastErrorMessage,
        lastContext: puppeteerSync.lastContext,
        totalAttempts: puppeteerSync.totalAttempts,
        totalSuccesses: puppeteerSync.totalSuccesses,
        totalFailures: puppeteerSync.totalFailures,
      },
    },
    texasBrowserLogin: process.env.TEXAS_BROWSER_LOGIN !== "false",
    localDebug: process.env.LOCAL_DEBUG === "true",
    scraperCircuit: getScraperCircuitStatus(),
  });
}

/** POST with header `x-cron-secret` matching CRON_SECRET resets scraper circuit breaker */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  resetScraperCircuit();
  return NextResponse.json({
    ok: true,
    message: "Scraper circuit breaker reset",
    scraperCircuit: getScraperCircuitStatus(),
  });
}
