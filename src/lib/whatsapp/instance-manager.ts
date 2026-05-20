import type { SupabaseClient } from "@supabase/supabase-js";
import { getEvolutionClient } from "@/lib/whatsapp/evolution-client";

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // "already exists" is fine — just proceed
    if (!msg.toLowerCase().includes("already")) {
      throw new Error(`تعذر إنشاء WhatsApp instance: ${msg}`);
    }
  }

  // Register webhook
  try {
    await evo.setWebhook(instanceName, webhookUrl);
  } catch (e) {
    console.warn("[instance-manager] setWebhook failed (non-fatal)", e);
  }

  // Get pairing code
  const pairingCode = await evo.getPairingCode(instanceName, phoneNumber.trim());

  // Upsert DB record
  const { error } = await supabase.from("whatsapp_instances").upsert(
    {
      user_id: userId,
      instance_name: instanceName,
      status: "connecting",
      phone_number: phoneNumber.trim(),
      error_message: null,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;

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

  const patch: Partial<WhatsAppInstance> = {
    status: state,
    last_seen_at: new Date().toISOString(),
  };
  if (state === "connected" && !instance.connected_at) {
    patch.connected_at = new Date().toISOString();
  }

  await supabase
    .from("whatsapp_instances")
    .update(patch)
    .eq("user_id", userId);

  return state;
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
