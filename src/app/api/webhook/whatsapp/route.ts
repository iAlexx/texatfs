/**
 * POST /api/webhook/whatsapp
 * Evolution API webhook receiver.
 *
 * Handles:
 *  - messages.upsert → parse 💰/📤 and save to cash_payments
 *  - connection.update → sync instance status in DB
 *
 * Evolution API sends this webhook for ALL instances.
 * We identify the Super Master via instance_name → whatsapp_instances.user_id
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { parseWhatsAppPayment, mightBePaymentMessage } from "@/lib/whatsapp/message-parser";
import { saveCashPayment } from "@/lib/whatsapp/cash-ledger";

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

  // ── connection.update: sync status to DB ──────────────────────────────────
  if (event === "connection.update" || event === "CONNECTION_UPDATE") {
    const state = (payload.data as { instance?: { state?: string } })
      ?.instance?.state;
    if (state) {
      const dbStatus =
        state === "open" ? "connected"
        : state === "connecting" ? "connecting"
        : "disconnected";

      await supabase
        .from("whatsapp_instances")
        .update({
          status: dbStatus,
          last_seen_at: new Date().toISOString(),
          ...(dbStatus === "connected" ? { connected_at: new Date().toISOString(), error_message: null } : {}),
        })
        .eq("instance_name", instanceName);
    }
    return;
  }

  // ── messages.upsert: parse payment emojis ────────────────────────────────
  if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") return;

  const msg = payload.data as EvoMessage;
  if (!msg?.key) return;
  if (msg.key.fromMe) return;                          // ignore own messages
  if (!isGroupJid(msg.key.remoteJid)) return;         // groups only

  const text = extractText(msg);
  if (!text || !mightBePaymentMessage(text)) return;

  const payment = parseWhatsAppPayment(text);
  if (!payment) return;

  // Look up which user owns this instance
  const { data: instanceRow } = await supabase
    .from("whatsapp_instances")
    .select("user_id")
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (!instanceRow?.user_id) {
    console.warn("[webhook/whatsapp] unknown instance", instanceName);
    return;
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
    senderJid: msg.key.participant ?? null,
    paymentDate: todayDamascus(),
  });

  console.info(
    `[webhook/whatsapp] saved payment: ${payment.direction} ${payment.amount} from group ${msg.key.remoteJid}`
  );
}
