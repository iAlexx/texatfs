import { NextResponse } from "next/server";
import {
  resolveLedgerUserIdOnly,
  LedgerAuthError,
} from "@/lib/ledger/resolve-user";
import { createLogger } from "@/lib/observability/logger";
import { captureError } from "@/lib/observability/capture-error";
import { parseRegisterPhoneBody } from "@/lib/validation/onboarding";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import {
  normalizeWhatsAppPhone,
  phoneToWhatsAppJid,
} from "@/lib/whatsapp/phone";
import { setUserWhatsAppPhone } from "@/lib/whatsapp/onboarding-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Short timeout — no Puppeteer or blocking external calls on this route. */
export const maxDuration = 15;

const log = createLogger("whatsapp/register-phone");

const WELCOME_DM = `👋 أهلاً بك في نظام Texas المالي الموحد!

🛡️ لحماية حسابك ومجموعاتك من الحظر، يرجى التكرم بالخطوات التالية فوراً:
1️⃣ احفظ رقم هذا البوت في جهات اتصال جوالك الآن.
2️⃣ قم بالرد على هذه الرسالة الخاصة بإرسال هذا الإيموجي تحديداً: 😎  لتأكيد الحفظ وتفعيل النظام تلقائياً.`;

function sendWelcomeDmInBackground(jid: string): void {
  void sendWhatsAppMessage(jid, WELCOME_DM).catch((err) => {
    log.warn("welcome DM failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = parseRegisterPhoneBody(rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { userId } = await resolveLedgerUserIdOnly(parsed.data);

    const normalized = normalizeWhatsAppPhone(
      String(parsed.data.countryCode ?? "963"),
      parsed.data.phone
    );

    if (!normalized.valid) {
      return NextResponse.json(
        { error: "رقم الهاتف غير صالح. تأكد من إدخال الرقم مع رمز الدولة." },
        { status: 400 }
      );
    }

    const digits = normalized.digits;

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
    log.error("register failed", { error: msg });
    void captureError(err, { scope: "whatsapp/register-phone" });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
