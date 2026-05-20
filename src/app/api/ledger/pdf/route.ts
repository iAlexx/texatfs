import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { buildLedgerStatementPdf } from "@/lib/pdf/ledger-statement";
import type { LedgerAuthInput } from "@/lib/ledger/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PdfBody extends LedgerAuthInput {
  ledgerDate?: string;
  viewUserId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PdfBody;
    const { user } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();
    const targetId = body.viewUserId ?? user.id;
    const ledgerDate = body.ledgerDate;

    if (targetId !== user.id) {
      const { assertCanViewUser } = await import("@/lib/hierarchy/sub-agents");
      await assertCanViewUser(supabase, user.id, targetId);
    }

    let query = supabase
      .from("daily_ledgers")
      .select("*")
      .eq("user_id", targetId);

    if (ledgerDate) {
      query = query.eq("ledger_date", ledgerDate);
    } else {
      query = query.order("ledger_date", { ascending: false }).limit(1);
    }

    const { data: ledger, error } = await query.maybeSingle();
    if (error) throw error;
    if (!ledger) {
      return NextResponse.json({ error: "لا يوجد سجل لهذا التاريخ" }, { status: 404 });
    }

    const { data: targetUser } = await supabase
      .from("users")
      .select("display_name, texas_username")
      .eq("id", targetId)
      .single();

    const name =
      targetUser?.display_name ??
      targetUser?.texas_username ??
      "مستخدم";

    const pdf = buildLedgerStatementPdf(ledger, name);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="texas-statement-${ledger.ledger_date}.pdf"`,
      },
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
