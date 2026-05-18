import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { isRailwayRuntime } from "@/lib/texas/texas-browser-config";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET() {
  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const puppeteerRuntime = existsSync(
    `${process.cwd()}/scripts/puppeteer-runtime.cjs`
  );

  return NextResponse.json({
    status: "ok",
    service: "texas-funds-calculate",
    timestamp: new Date().toISOString(),
    railway: isRailwayRuntime(),
    puppeteer: {
      executablePath: chromiumPath ?? null,
      chromiumOnDisk: chromiumPath ? existsSync(chromiumPath) : false,
      runtimeLoader: puppeteerRuntime,
    },
    texasBrowserLogin: process.env.TEXAS_BROWSER_LOGIN !== "false",
    localDebug: process.env.LOCAL_DEBUG === "true",
  });
}
