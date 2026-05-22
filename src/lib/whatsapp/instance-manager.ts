import type { SupabaseClient } from "@supabase/supabase-js";
import { getEvolutionClient, EvolutionApiError } from "@/lib/whatsapp/evolution-client";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  // ── Step 1: Ensure instance exists in Evolution API ─────────────────────
  let instanceExists = false;
  try {
    await evo.createInstance(instanceName);
    instanceExists = true;
    console.info("[instance-manager] instance created:", instanceName);
  } catch (e) {
    if (e instanceof EvolutionApiError) {
      if (e.httpStatus === 401) throw e; // wrong API key — fatal

      // 403: Evolution API returns this when the instance name is already taken
      // 404: shouldn't happen on create, but treat as non-fatal
      if (e.httpStatus === 403 || e.httpStatus === 404) {
        console.info("[instance-manager] createInstance →", e.httpStatus, "— assuming exists:", instanceName);
        instanceExists = true;
      } else {
        throw e; // 502, network, etc. — fatal
      }
    } else {
      // Raw Axios error not caught by interceptor (e.g. 409 Conflict)
      const status = (e as { response?: { status?: number } }).response?.status;
      const msg    = e instanceof Error ? e.message : String(e);
      const alreadyExists =
        status === 409 ||
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("exists");
      if (!alreadyExists) {
        throw new EvolutionApiError(`تعذر إنشاء جلسة WhatsApp: ${msg}`, status ?? 0);
      }
      instanceExists = true;
      console.info("[instance-manager] instance already exists (409):", instanceName);
    }
  }

  // Evolution API v2 needs time to build the internal Baileys socket and sync
  // to its database before the /instance/connect endpoint becomes available.
  // 3.5 s covers the typical PostgreSQL-backed initialization window.
  if (instanceExists) {
    await sleep(3_500);
  }

  // ── Step 2: Register webhook (non-fatal) ─────────────────────────────────
  try {
    await evo.setWebhook(instanceName, webhookUrl);
  } catch (e) {
    console.warn(
      "[instance-manager] setWebhook failed (non-fatal):",
      e instanceof EvolutionApiError ? e.message : e
    );
  }

  // ── Step 3: Request pairing code — 5-attempt backoff strategy ────────────
  // Delay schedule (milliseconds between attempts, starting from attempt 2):
  //   attempt 1 — immediately (after the 3.5 s initial delay above)
  //   attempt 2 — +2 500 ms
  //   attempt 3 — +3 500 ms
  //   attempt 4 — +4 500 ms
  //   attempt 5 — delete + recreate instance, then +4 000 ms (last resort)
  const RETRY_DELAYS_MS = [0, 2_500, 3_500, 4_500, 4_000];
  const MAX_ATTEMPTS = 5;

  const phone = phoneNumber.trim();
  let pairingCode = "";
  let lastError: EvolutionApiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 3_000;

    if (attempt > 1) {
      // On the last attempt: wipe the instance and start fresh
      if (attempt === MAX_ATTEMPTS) {
        console.info("[instance-manager] last attempt — deleting and recreating instance");
        try {
          await evo.deleteInstance(instanceName);
          await sleep(1_500);
          await evo.createInstance(instanceName);
          console.info("[instance-manager] instance recreated for final attempt");
        } catch (recreateErr) {
          console.warn("[instance-manager] recreate failed (continuing anyway):", recreateErr);
        }
      }
      console.info(`[instance-manager] waiting ${delayMs} ms before attempt ${attempt}`);
      await sleep(delayMs);
    }

    try {
      pairingCode = await evo.getPairingCode(instanceName, phone);
      lastError = null;
      console.info(`[instance-manager] pairing code obtained on attempt ${attempt}`);
      break; // success
    } catch (e) {
      if (e instanceof EvolutionApiError) {
        lastError = e;

        // Wrong API key — never retry
        if (e.httpStatus === 401) throw e;

        if (e.httpStatus === 404) {
          console.warn(
            `[instance-manager] getPairingCode 404 (attempt ${attempt}/${MAX_ATTEMPTS}) — instance not ready yet`
          );
          // Continue to next attempt (delay + optional wipe already handled above)
          continue;
        }

        // Other error (422 bad phone, 403, etc.) — log and retry unless on last attempt
        console.error(
          `[instance-manager] getPairingCode error (attempt ${attempt}/${MAX_ATTEMPTS}):`,
          e.message
        );
        if (attempt === MAX_ATTEMPTS) throw e;
        continue;
      }

      // Raw Axios error that slipped past the interceptor
      const status = (e as { response?: { status?: number } }).response?.status;
      lastError = new EvolutionApiError(
        `تعذر الحصول على رمز الإقران (${status ?? "network"})`,
        status ?? 0
      );
      if (attempt === MAX_ATTEMPTS) throw lastError;
    }
  }

  if (!pairingCode) {
    throw lastError ?? new EvolutionApiError("تعذر الحصول على رمز الإقران بعد عدة محاولات", 0);
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
