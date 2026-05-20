/**
 * POST /api/whatsapp/connect
 * Body: { initData, telegramUserId, phone }
 * → { instanceName, pairingCode }
 *
 * The user enters the pairing code on their phone → WhatsApp links the device.
 * Poll /api/whatsapp/status to confirm connection.
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { startInstanceConnection } from "@/lib/whatsapp/instance-manager";
import { canManageNetwork } from "@/lib/hierarchy/subtree-rules";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 30;

interface Body extends LedgerAuthInput {
  phone: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const phone = body.phone?.trim();

    if (!phone || !/^\d{7,15}$/.test(phone)) {
      return Response.json(
        { error: "رقم الهاتف غير صالح. أدخل الأرقام فقط بدون + (مثال: 963912345678)" },
        { status: 400 }
      );
    }

    const { user, subscriptionActive } = await resolveLedgerUser(body);

    if (!subscriptionActive) {
      return Response.json(
        { error: "انتهى الاشتراك", subscription_active: false },
        { status: 402 }
      );
    }
    if (!canManageNetwork(user.role)) {
      return Response.json(
        { error: "صلاحية الاتصال بـ WhatsApp متاحة للماسترات فقط" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const { instanceName, pairingCode } = await startInstanceConnection(
      supabase,
      user.id,
      phone
    );

    return Response.json(
      { ok: true, instanceName, pairingCode },
      { status: 200 }
    );
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "تعذر الاتصال بـ WhatsApp";
    console.error("[whatsapp/connect]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
