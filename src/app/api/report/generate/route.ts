import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { generateAndSendReport } from "@/lib/report/generate-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

interface Body extends LedgerAuthInput {
  agent_id?: string;
  /** @deprecated */
  targetUserId?: string;
  ledgerDate?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { user } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();

    if (!user.telegram_id) {
      return NextResponse.json(
        { error: "حساب تيليغرام غير مربوط" },
        { status: 400 }
      );
    }

    const result = await generateAndSendReport({
      supabase,
      viewerId: user.id,
      viewerTelegramId: user.telegram_id,
      targetUserId: body.agent_id ?? body.targetUserId,
      ledgerDate: body.ledgerDate,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg.includes("لا يوجد") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
