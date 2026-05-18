import { NextResponse } from "next/server";
import { verifyRenderToken } from "@/lib/cron/auth";
import { loadReportRenderData } from "@/lib/report/load-report-data";
import { renderReportHtml } from "@/lib/report/render-report-html";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const token = new URL(request.url).searchParams.get("token");
  if (!verifyRenderToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const data = await loadReportRenderData(supabase, context.params.id);

  if (!data) {
    return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
  }

  const html = renderReportHtml(data);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
