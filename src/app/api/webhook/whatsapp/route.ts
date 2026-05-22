/**
 * POST /api/webhook/whatsapp
 * Evolution API webhook receiver.
 *
 * Handles:
 *  - messages.upsert → parse 💰/📤 and save to cash_payments
 *  - connection.update → sync instance status in DB + send welcome on first connect
 *
 * Evolution API sends this webhook for ALL instances.
 * We identify the Super Master via instance_name → whatsapp_instances.user_id
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { parseWhatsAppPayment, mightBePaymentMessage } from "@/lib/whatsapp/message-parser";
import { saveCashPayment } from "@/lib/whatsapp/cash-ledger";
import { getEvolutionClient } from "@/lib/whatsapp/evolution-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

/* ── Evolution API webhook payload shape (simplified) ───────────────────── */
interface EvoMessage {
  key: {
    remoteJid: string;       // group JID or sender JID
    id: string;              // message ID
    fromMe: boolean;
    participant?: string;    // actual sender in a group
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
  };
  messageType?: string;
  pushName?: string;
}

interface EvoWebhookPayload {
  event:    string;
  instance: string;          // Evolution instance name
  data:     EvoMessage | { instance?: { state?: string } } | unknown;
}

function extractText(msg: EvoMessage): string | null {
  return (
    msg.message?.conversation?.trim() ||
    msg.message?.extendedTextMessage?.text?.trim() ||
    null
  );
}

function todayDamascus(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Damascus" });
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

export async function POST(request: Request) {
  // Verify Evolution API secret header (optional but recommended)
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("apikey") ?? request.headers.get("x-webhook-secret");
    if (header !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: EvoWebhookPayload;
  try {
    payload = (await request.json()) as EvoWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, instance: instanceName } = payload;

  // Always return 200 fast — process async
  void handleWebhookAsync(event, instanceName, payload).catch((e) => {
    console.error("[webhook/whatsapp] async handler error", e instanceof Error ? e.message : String(e));
  });

  return Response.json({ ok: true });
}

async function handleWebhookAsync(
  event: string,
  instanceName: string,
  payload: EvoWebhookPayload
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // ── connection.update: sync status to DB + welcome on first connect ───────
  if (event === "connection.update" || event === "CONNECTION_UPDATE") {
    const data = payload.data as Record<string, unknown>;

    // Evolution API v2 puts state at payload.data.state (NOT payload.data.instance.state)
    // Support both shapes for forward-compat with different Evolution API builds.
    const state =
      (data?.state as string | undefined) ??
      ((data?.instance as Record<string, unknown> | undefined)?.state as string | undefined);

    if (!state) return;

    const dbStatus =
      state === "open"       ? "connected"
      : state === "connecting" ? "connecting"
      : "disconnected";

    // Fetch current row to detect first-time connection
    const { data: existing } = await supabase
      .from("whatsapp_instances")
      .select("user_id, connected_at, phone_number")
      .eq("instance_name", instanceName)
      .maybeSingle();

    const isFirstConnection = dbStatus === "connected" && existing && !existing.connected_at;

    const patch: Record<string, unknown> = {
      status: dbStatus,
      last_seen_at: new Date().toISOString(),
    };
    if (dbStatus === "connected") {
      patch.error_message = null;
      if (isFirstConnection) patch.connected_at = new Date().toISOString();
    }

    await supabase
      .from("whatsapp_instances")
      .update(patch)
      .eq("instance_name", instanceName);

    // Send welcome message only on the very first successful connection
    if (isFirstConnection && existing?.phone_number && existing?.user_id) {
      void sendWelcomeFromWebhook(
        instanceName,
        existing.phone_number as string,
        existing.user_id as string,
        supabase
      ).catch((e) =>
        console.warn("[webhook/whatsapp] welcome message failed (non-fatal):", e instanceof Error ? e.message : e)
      );
    }
    return;
  }

  // ── messages.upsert: parse payment emojis ────────────────────────────────
  if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") return;

  // Evolution API v2 wraps messages in an array; v1 sends a single object
  const rawData = payload.data;
  const messages: EvoMessage[] = Array.isArray(rawData)
    ? (rawData as EvoMessage[])
    : [rawData as EvoMessage];

  for (const msg of messages) {
    if (!msg?.key) continue;
    if (msg.key.fromMe) continue;                        // ignore own messages
    if (!isGroupJid(msg.key.remoteJid)) continue;       // groups only

    const text = extractText(msg);
    if (!text || !mightBePaymentMessage(text)) continue;

    const payment = parseWhatsAppPayment(text);
    if (!payment) continue;

    // Look up which user owns this instance
    const { data: instanceRow } = await supabase
      .from("whatsapp_instances")
      .select("user_id")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!instanceRow?.user_id) {
      console.warn("[webhook/whatsapp] unknown instance", instanceName);
      continue;
    }

    // Fetch group name from DB (best-effort)
    const { data: groupRow } = await supabase
      .from("whatsapp_groups")
      .select("group_name")
      .eq("group_jid", msg.key.remoteJid)
      .maybeSingle();

    await saveCashPayment(supabase, {
      userId: instanceRow.user_id,
      groupJid: msg.key.remoteJid,
      groupName: groupRow?.group_name ?? null,
      messageId: msg.key.id,
      payment,
      rawMessage: text,
      senderJid: msg.key.participant ?? undefined,
      paymentDate: todayDamascus(),
    });

    console.info(
      `[webhook/whatsapp] saved payment: ${payment.direction} ${payment.amount} from group ${msg.key.remoteJid}`
    );
  }
}

/** Send Arabic welcome message on very first WhatsApp connection. */
async function sendWelcomeFromWebhook(
  instanceName: string,
  phoneNumber: string,
  userId: string,
  supabase: ReturnType<typeof getSupabaseServiceClient>
): Promise<void> {
  const { data: userRow } = await supabase
    .from("users")
    .select("display_name, texas_username")
    .eq("id", userId)
    .maybeSingle();
  const name = (userRow?.display_name ?? userRow?.texas_username ?? "صديقي") as string;

  const jid = `${phoneNumber.replace(/\D/g, "")}@s.whatsapp.net`;

  const welcomeText = `مرحباً ${name} 👑

تم ربط حسابك في منصة *Texas Funds Pro Max* بـ WhatsApp بنجاح! ✅

━━━━━━━━━━━━━━━━━━
📋 *كيف تستخدم البوت:*

1️⃣ *إنشاء مجموعات التقارير 🔥*
أنشئ مجموعات واتساب وضع 🔥 في اسم المجموعة
• سيُرسل التقرير اليومي إليها تلقائياً كل يوم الساعة 4:00 صباحاً

2️⃣ *تسجيل المدفوعات النقدية:*
💰 [المبلغ] ← وصل منك (كاش استلمته)
📤 [المبلغ] ← واصل إليك (كاش أرسلته)

مثال:
💰 500
📤 250

3️⃣ *التقرير اليومي التلقائي:*
• يُرسل كل يوم الساعة 4:00 صباحاً
• يتضمن: رصيد تكساس + صافي الكاش + الرصيد النهائي

━━━━━━━━━━━━━━━━━━
*Texas Funds Pro Max* 🏆`;

  const evo = getEvolutionClient();
  await evo.sendTextMessage(instanceName, jid, welcomeText);
  console.info(`[webhook/whatsapp] welcome message sent to ${jid}`);
}
