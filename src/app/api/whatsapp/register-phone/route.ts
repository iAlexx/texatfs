import { NextResponse } from "next/server";
import {
  resolveLedgerUserIdOnly,
  LedgerAuthError,
} from "@/lib/ledger/resolve-user";
import { createLogger } from "@/lib/observability/logger";
import { captureError } from "@/lib/observability/capture-error";
import { parseRegisterPhoneBody } from "@/lib/validation/onboarding";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { registerWhatsAppPhone } from "@/lib/whatsapp/register-phone-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

const log = createLogger("whatsapp/register-phone");

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = parseRegisterPhoneBody(rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { userId } = await resolveLedgerUserIdOnly(parsed.data);
    const supabase = getSupabaseServiceClient();

    const result = await registerWhatsAppPhone(supabase, {
      userId,
      phone: parsed.data.phone,
      countryCode: String(parsed.data.countryCode ?? "963"),
    });

    if (!result.botNumberConfigured) {
      log.warn("phone saved; WHATSAPP_BOT_NUMBER missing — user must message bot manually", {
        userId,
        phone: result.phone.slice(-4),
      });
    } else {
      log.info("phone saved; awaiting user-initiated WhatsApp activation", {
        userId,
        phone: result.phone.slice(-4),
        botNumber: result.botWhatsappNumber?.slice(-4),
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LedgerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Server error";
    if (msg === "INVALID_PHONE") {
      return NextResponse.json(
        { error: "رقم الهاتف غير صالح. تأكد من إدخال الرقم مع رمز الدولة." },
        { status: 400 }
      );
    }
    if (msg === "PHONE_IN_USE") {
      return NextResponse.json(
        { error: "هذا الرقم مربوط بحساب آخر." },
        { status: 409 }
      );
    }
    log.error("register failed", { error: msg });
    void captureError(err, { scope: "whatsapp/register-phone" });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
