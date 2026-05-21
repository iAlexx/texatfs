import type { SupabaseClient } from "@supabase/supabase-js";
import { getEvolutionClient, EvolutionApiError } from "@/lib/whatsapp/evolution-client";

export interface WhatsAppInstance {
  id: string;
  user_id: string;
  instance_name: string;
  status: "creating" | "connecting" | "connected" | "disconnected" | "error";
  phone_number: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Derive a stable Evolution instance name from a Supabase user ID. */
export function instanceNameForUser(userId: string): string {
  // Use first 8 chars of UUID — unique enough + Evolution API name limit
  return `txf-${userId.replace(/-/g, "").slice(0, 12)}`;
}

/** Get the current instance record for a user (null if none). */
export async function getUserInstance(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppInstance | null> {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as WhatsAppInstance | null);
}

/** Get all connected instances (for cron use). */
export async function getAllConnectedInstances(
  supabase: SupabaseClient
): Promise<WhatsAppInstance[]> {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("status", "connected");
  if (error) throw error;
  return (data ?? []) as WhatsAppInstance[];
}

/**
 * Start connection process:
 * 1. Create Evolution instance (if not exists)
 * 2. Request pairing code for phone number
 * 3. Register webhook
 * 4. Persist to DB with status = 'connecting'
 */
export async function startInstanceConnection(
  supabase: SupabaseClient,
  userId: string,
  phoneNumber: string
): Promise<{ instanceName: string; pairingCode: string }> {
  const evo = getEvolutionClient();
  const instanceName = instanceNameForUser(userId);
  const webhookUrl = resolveWebhookUrl();

  // Create instance in Evolution API (idempotent — safe to call again)
  try {
    await evo.createInstance(instanceName);
    console.info("[instance-manager] instance created", instanceName);
  } catch (e) {
    if (e instanceof EvolutionApiError) {
      // 401 = wrong API key — fatal, stop immediately
      if (e.httpStatus === 401) throw e;

      // 403 from createInstance usually means the instance already exists in
      // Evolution API (returned when the instance is in a connected/connecting state).
      // Fall through and attempt to get pairing code anyway.
      if (e.httpStatus === 403) {
        console.info(
          "[instance-manager] createInstance returned 403 — assuming instance exists, proceeding.",
          { instanceName, detail: e.message }
        );
        // continue — don't throw
      } else {
        // Any other EvolutionApiError (502, network, etc.) is fatal
        throw e;
      }
    } else {
      // Raw Axios error (interceptor did not convert it — e.g. 409 Conflict)
      const status = (e as { response?: { status?: number } }).response?.status;
      const msg    = e instanceof Error ? e.message : String(e);
      const isAlreadyExists =
        status === 409 ||
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("exists");

      if (!isAlreadyExists) {
        throw new EvolutionApiError(`تعذر إنشاء جلسة WhatsApp: ${msg}`, status ?? 0);
      }
      console.info("[instance-manager] instance already exists (409), proceeding", instanceName);
    }
  }

  // Register webhook (non-fatal if Evolution API doesn't support it yet)
  try {
    await evo.setWebhook(instanceName, webhookUrl);
  } catch (e) {
    if (e instanceof EvolutionApiError) {
      console.warn("[instance-manager] setWebhook failed (non-fatal):", e.message);
    } else {
      console.warn("[instance-manager] setWebhook failed (non-fatal)", e);
    }
  }

  // Get pairing code — this can fail if phone format is wrong or instance is in bad state
  let pairingCode: string;
  try {
    pairingCode = await evo.getPairingCode(instanceName, phoneNumber.trim());
  } catch (e) {
    if (e instanceof EvolutionApiError) throw e;
    const status = (e as { response?: { status?: number } }).response?.status;
    const msg    = e instanceof Error ? e.message : String(e);
    throw new EvolutionApiError(
      `تعذر الحصول على رمز الإقران: ${msg}`,
      status ?? 0
    );
  }

  // Upsert DB record
  const { error: dbError } = await supabase.from("whatsapp_instances").upsert(
    {
      user_id:       userId,
      instance_name: instanceName,
      status:        "connecting",
      phone_number:  phoneNumber.trim(),
      error_message: null,
    },
    { onConflict: "user_id" }
  );
  if (dbError) throw dbError;

  return { instanceName, pairingCode };
}

/** Poll Evolution API and sync connection state to DB. Returns current state. */
export async function syncInstanceStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppInstance["status"]> {
  const instance = await getUserInstance(supabase, userId);
  if (!instance) return "disconnected";

  const evo = getEvolutionClient();

  let state: WhatsAppInstance["status"];
  try {
    const raw = await evo.getConnectionState(instance.instance_name);
    if (raw === "open") state = "connected";
    else if (raw === "connecting") state = "connecting";
    else state = "disconnected";
  } catch {
    state = "error";
  }

  const isFirstConnection = state === "connected" && !instance.connected_at;

  const patch: Partial<WhatsAppInstance> = {
    status: state,
    last_seen_at: new Date().toISOString(),
  };
  if (isFirstConnection) {
    patch.connected_at = new Date().toISOString();
  }

  await supabase
    .from("whatsapp_instances")
    .update(patch)
    .eq("user_id", userId);

  // Send welcome message on first successful connection
  if (isFirstConnection && instance.phone_number) {
    void sendWelcomeMessage(
      evo,
      instance.instance_name,
      instance.phone_number,
      supabase,
      userId
    ).catch((e) =>
      console.warn("[instance-manager] welcome message failed (non-fatal)", e instanceof Error ? e.message : e)
    );
  }

  return state;
}

async function sendWelcomeMessage(
  evo: import("@/lib/whatsapp/evolution-client").EvolutionClient,
  instanceName: string,
  phoneNumber: string,
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  // Fetch owner display name
  const { data: userRow } = await supabase
    .from("users")
    .select("display_name, texas_username")
    .eq("id", userId)
    .maybeSingle();
  const name = userRow?.display_name ?? userRow?.texas_username ?? "صديقي";

  // Personal JID: phoneNumber@s.whatsapp.net
  const jid = `${phoneNumber.replace(/\D/g, "")}@s.whatsapp.net`;

  const welcomeText = `مرحباً ${name} 👑

تم ربط حسابك في منصة *Texas Funds Pro Max* بـ WhatsApp بنجاح! 🎉

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

  await evo.sendTextMessage(instanceName, jid, welcomeText);
  console.info(`[instance-manager] welcome message sent to ${jid}`);
}

/** Disconnect + delete Evolution instance. */
export async function disconnectInstance(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const instance = await getUserInstance(supabase, userId);
  if (!instance) return;

  const evo = getEvolutionClient();
  try {
    await evo.logoutInstance(instance.instance_name);
  } catch (e) {
    console.warn("[instance-manager] logoutInstance failed (non-fatal)", e);
  }
  try {
    await evo.deleteInstance(instance.instance_name);
  } catch (e) {
    console.warn("[instance-manager] deleteInstance failed (non-fatal)", e);
  }

  await supabase
    .from("whatsapp_instances")
    .update({ status: "disconnected", connected_at: null })
    .eq("user_id", userId);
}

function resolveWebhookUrl(): string {
  const base =
    process.env.REPORT_RENDER_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!base) {
    throw new Error(
      "REPORT_RENDER_BASE_URL or NEXT_PUBLIC_APP_URL must be set for WhatsApp webhook registration"
    );
  }
  return `${base.replace(/\/$/, "")}/api/webhook/whatsapp`;
}
