import { NextResponse } from "next/server";
import {
  LedgerAuthError,
  resolveLedgerUserIdOnly,
} from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  RegistrationError,
  RegistrationService,
} from "@/lib/services/RegistrationService";
import { createLogger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = createLogger("texas/repair-credentials");

interface Body extends LedgerAuthInput {
  texasLogin?: string;
  texasPassword?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const texasLogin = body.texasLogin?.trim();
    const texasPassword = body.texasPassword?.trim();

    if (!texasLogin || !texasPassword || texasPassword.length < 4) {
      return NextResponse.json(
        { error: "أدخل اسم مستخدم تكساس وكلمة المرور (٤ أحرف على الأقل)." },
        { status: 400 }
      );
    }

    const { userId } = await resolveLedgerUserIdOnly(body);
    const supabase = getSupabaseServiceClient();
    const registration = new RegistrationService(supabase);

    await registration.repairTexasCredentialsForUser(
      userId,
      texasLogin,
      texasPassword
    );

    log.info("Texas credentials repaired via profile", { userId });

    return NextResponse.json({
      ok: true,
      message: "تم ربط حساب تكساس بنجاح. يمكنك فتح لوحة المحاسبة الآن.",
    });
  } catch (err) {
    if (err instanceof LedgerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof RegistrationError) {
      if (err.code === "SUBSCRIPTION_EXPIRED_NEED_RENEWAL") {
        return NextResponse.json(
          { error: "انتهى اشتراكك. أرسل مفتاح تجديد من البوت أولاً." },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Server error";
    if (msg.includes("Texas sign-in failed")) {
      return NextResponse.json(
        { error: "فشل التحقق من تكساس. تأكد من اسم المستخدم وكلمة المرور." },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
