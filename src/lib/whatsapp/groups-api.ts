/**
 * WASenderAPI group management (create, invite link, promote).
 * Uses the same Bearer token and base URL as the message client.
 */
import { WhatsAppError } from "@/lib/whatsapp/client";

const DEFAULT_BASE_URL = "https://api.wasenderapi.com";
const GATEWAY_TIMEOUT_MS = 20_000;

function getToken(): string {
  const t = process.env.WHATSAPP_API_TOKEN;
  if (!t) {
    throw new WhatsAppError("WHATSAPP_API_TOKEN is not configured.", "not_configured");
  }
  return t;
}

function getBaseUrl(): string {
  return process.env.WHATSAPP_API_URL?.trim() || DEFAULT_BASE_URL;
}

async function gatewayRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization:  `Bearer ${getToken()}`,
        Accept:         "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new WhatsAppError(
      `WhatsApp gateway unreachable: ${err instanceof Error ? err.message : String(err)}`,
      "network"
    );
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const msg =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new WhatsAppError(`WhatsApp group API error: ${msg}`, "upstream", res.status);
  }

  return parsed as T;
}

export interface CreateGroupResult {
  groupJid: string;
  raw: unknown;
}

/**
 * Create a WhatsApp group with the given name and initial participants.
 * @see https://wasenderapi.com/api-docs/groups
 */
export async function createWhatsAppGroup(
  name: string,
  participantJids: string[]
): Promise<CreateGroupResult> {
  const raw = await gatewayRequest<Record<string, unknown>>("POST", "/api/groups", {
    name,
    groupName: name,
    participants: participantJids,
  });

  const data = (raw.data ?? raw.result ?? raw) as Record<string, unknown>;
  const groupJid =
    pickString(data.jid) ??
    pickString(data.groupJid) ??
    pickString(data.groupId) ??
    pickString(data.id) ??
    pickString(raw.jid) ??
    pickString(raw.groupJid);

  if (!groupJid) {
    console.error("[whatsapp/groups] createGroup: missing jid in response", raw);
    throw new WhatsAppError(
      "لم يُرجع المزود معرّف المجموعة بعد الإنشاء.",
      "upstream"
    );
  }

  return { groupJid, raw };
}

/** Retrieve chat.whatsapp.com invite link (requires bot session as group admin). */
export async function getWhatsAppGroupInviteLink(groupJid: string): Promise<string> {
  const encoded = encodeURIComponent(groupJid);
  const raw = await gatewayRequest<Record<string, unknown>>(
    "GET",
    `/api/groups/${encoded}/invite-link`
  );

  const link =
    pickString(raw.inviteLink) ??
    pickString((raw.data as Record<string, unknown> | undefined)?.inviteLink) ??
    pickString((raw.result as Record<string, unknown> | undefined)?.inviteLink);

  return link ?? "";
}

/** Promote participants to group admin. */
export async function promoteWhatsAppGroupParticipants(
  groupJid: string,
  participantJids: string[]
): Promise<void> {
  const encoded = encodeURIComponent(groupJid);
  await gatewayRequest("PUT", `/api/groups/${encoded}/participants/update`, {
    action: "promote",
    participants: participantJids,
  });
}

/** Add participants to an existing group (if not included at creation time). */
export async function addWhatsAppGroupParticipants(
  groupJid: string,
  participantJids: string[]
): Promise<void> {
  const encoded = encodeURIComponent(groupJid);
  await gatewayRequest("POST", `/api/groups/${encoded}/participants`, {
    participants: participantJids,
    action: "add",
  });
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
