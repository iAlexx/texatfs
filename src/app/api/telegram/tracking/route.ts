/**
 * GET /api/telegram/tracking/status?telegram_id=<number>
 * Returns the Telegram tracking system status for the calling master.
 * Used by the TMA Profile page to poll connection state.
 */
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getTrackingStatusForUser } from "@/lib/telegram/tracking-groups";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("telegram_id");

  if (!rawId) {
    return NextResponse.json(
      { error: "telegram_id query param is required" },
      { status: 400 }
    );
  }

  const telegramId = Number(rawId);
  if (Number.isNaN(telegramId) || telegramId <= 0) {
    return NextResponse.json(
      { error: "Invalid telegram_id" },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Resolve user_id from telegram_id
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (userErr) throw userErr;

    if (!userRow) {
      return NextResponse.json({
        active: false,
        chatTitle: null,
        chatId: null,
        topicCount: 0,
      });
    }

    const status = await getTrackingStatusForUser(supabase, userRow.id);
    return NextResponse.json(status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[api/telegram/tracking] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
