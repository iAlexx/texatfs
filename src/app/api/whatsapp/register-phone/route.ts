import { NextResponse } from "next/server";
import {
  resolveLedgerUserIdOnly,
  LedgerAuthError,
} from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import {
  normalizePhoneDigits,
  isValidPhoneDigits,
  phoneToWhatsAppJid,
} from "@/lib/whatsapp/phone";
import { setUserWhatsAppPhone } from "@/lib/whatsapp/onboarding-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Short timeout — no Puppeteer or blocking external calls on this route. */
export const maxDuration = 15;

const WELCOME_DM = `👋 أهلاً بك في نظام Texas المالي الموحد!

🛡️ لحماية حسابك ومجموعاتك من الحظر، يرجى التكرم بالخطوات التالية فوراً:
1️⃣ احفظ رقم هذا البوت في جهات اتصال جوالك الآن.
2️⃣ قم بالرد على هذه الرسالة الخاصة بإرسال هذا الإيموجي تحديداً: 😎  لتأكيد الحفظ وتفعيل النظام تلقائياً.`;

/** Non-blocking welcome DM — failures must never affect the API response. */
function sendWelcomeDmInBackground(jid: string): void {
  void sendWhatsAppMessage(jid, WELCOME_DM).catch((err) => {
    console.error(
      "[register-phone] welcome DM failed (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LedgerAuthInput & {
      phone?: string;
      countryCode?: string;
    };

    const { userId } = await resolveLedgerUserIdOnly(body);

    const rawPhone = String(body.phone ?? "").trim();
    if (!rawPhone) {
      return NextResponse.json(
        { error: "رقم الهاتف مطلوب." },
        { status: 400 }
      );
    }

    const cc = normalizePhoneDigits(String(body.countryCode ?? "963"));
    let digits = normalizePhoneDigits(rawPhone);

    if (digits.startsWith("0")) {
      digits = digits.replace(/^0+/, "");
    }
    if (!digits.startsWith(cc) && digits.length <= 10) {
      digits = cc + digits;
    }

    if (!isValidPhoneDigits(digits)) {
      return NextResponse.json(
        { error: "رقم الهاتف غير صالح. تأكد من إدخال الرقم مع رمز الدولة." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();

    const { data: phoneOwner } = await supabase
      .from("users")
      .select("id")
      .eq("whatsapp_phone", digits)
      .neq("id", userId)
      .maybeSingle();

    if (phoneOwner) {
      return NextResponse.json(
        { error: "هذا الرقم مربوط بحساب آخر." },
        { status: 409 }
      );
    }

    // CRITICAL: persist phone + status before any WhatsApp/Texas/Puppeteer work.
    await setUserWhatsAppPhone(supabase, userId, digits, "PENDING_EMOJI");

    sendWelcomeDmInBackground(phoneToWhatsAppJid(digits));

    return NextResponse.json({
      success: true,
      phone: digits,
      onboardingStatus: "PENDING_EMOJI",
    });
  } catch (err) {
    if (err instanceof LedgerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Server error";
    console.error("[register-phone] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
