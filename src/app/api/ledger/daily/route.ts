import { NextResponse } from "next/server";
import { mapLedgerRow } from "@/lib/supabase/client";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { AppUser, DailyLedger, LedgerSessionResponse } from "@/lib/supabase/database.types";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import {
  parseTelegramUserId,
  validateTelegramInitData,
} from "@/lib/telegram/validate-init-data";

interface RequestBody {
  initData?: string;
  telegramUserId?: number;
  ledgerDate?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const isDev = process.env.NODE_ENV === "development";

    let telegramId = body.telegramUserId ?? null;

    if (body.initData && body.initData !== "dev-mode") {
      if (!botToken) {
        return NextResponse.json(
          { error: "TELEGRAM_BOT_TOKEN not configured" },
          { status: 500 }
        );
      }
      if (!validateTelegramInitData(body.initData, botToken)) {
        return NextResponse.json(
          { error: "Invalid Telegram initData" },
          { status: 401 }
        );
      }
      telegramId = parseTelegramUserId(body.initData) ?? telegramId;
    } else if (!isDev) {
      return NextResponse.json(
        { error: "Telegram authentication required" },
        { status: 401 }
      );
    }

    if (!telegramId && process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID) {
      telegramId = Number(process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID);
    }

    if (!telegramId) {
      return NextResponse.json(
        { error: "Could not resolve Telegram user" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const subscription = new SubscriptionService(supabase);
    const ledgerDate = body.ledgerDate ?? todayIsoDate();

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select(
        "id, telegram_id, role, display_name, texas_username, subscription_end_date"
      )
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (userError) throw userError;
    if (!userRow) {
      return NextResponse.json(
        { error: "User not linked to Telegram account. Send /start to the bot." },
        { status: 404 }
      );
    }

    const subscriptionActive = await subscription.isActive(userRow.id);

    const user: AppUser = {
      id: userRow.id,
      telegram_id: userRow.telegram_id,
      role: userRow.role,
      display_name: userRow.display_name,
      texas_username: userRow.texas_username,
      subscription_end_date: userRow.subscription_end_date,
      subscription_active: subscriptionActive,
    };

    if (!subscriptionActive) {
      const payload: LedgerSessionResponse = {
        user,
        ledger: null,
        subscription_active: false,
      };
      return NextResponse.json(payload, { status: 402 });
    }

    const { data: ledgerRow, error: ledgerError } = await supabase
      .from("daily_ledgers")
      .select(
        "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at"
      )
      .eq("user_id", userRow.id)
      .eq("ledger_date", ledgerDate)
      .maybeSingle();

    if (ledgerError) throw ledgerError;

    const ledger: DailyLedger | null = ledgerRow
      ? mapLedgerRow(ledgerRow)
      : null;

    const payload: LedgerSessionResponse = {
      user,
      ledger,
      subscription_active: true,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
