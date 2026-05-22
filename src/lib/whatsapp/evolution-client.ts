/**
 * Evolution API v2 HTTP client.
 * Docs: https://doc.evolution-api.com/v2
 */
import axios, { type AxiosInstance } from "axios";

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
}

export interface EvolutionInstanceInfo {
  instance: {
    instanceName: string;
    instanceId?: string;
    status: string;
  };
}

export interface EvolutionConnectionState {
  instance: {
    instanceName: string;
    state: "open" | "connecting" | "close" | "refused";
  };
}

export interface EvolutionPairingCodeResponse {
  /** Evolution API v1/some v2 builds return "code" */
  code?: string;
  /** Evolution API v2 newer builds return "pairingCode" */
  pairingCode?: string;
}

export interface EvolutionGroup {
  id: string;       // JID e.g. "12345@g.us"
  subject: string;  // Group name
  subjectOwner?: string;
  subjectTime?: number;
  pictureUrl?: string | null;
  size?: number;
  creation?: number;
  owner?: string;
  desc?: string;
  participants?: { id: string; admin?: "admin" | "superadmin" | null }[];
}

export interface EvolutionSendMediaResponse {
  key: { id: string };
  status: string;
}

/**
 * Thrown for every Evolution API communication error.
 * Message is always in Arabic and safe to show in the UI.
 */
export class EvolutionApiError extends Error {
  constructor(
    message: string,
    /** HTTP status that triggered the error (0 = network-level failure) */
    readonly httpStatus: number = 0
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}

export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL?.trim() &&
    process.env.EVOLUTION_API_KEY?.trim()
  );
}

/** Remove surrounding quotes that Railway sometimes adds when copy-pasting values. */
function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

function resolveEvolutionConfig(): EvolutionConfig {
  const rawUrl = process.env.EVOLUTION_API_URL?.trim() ?? "";
  const rawKey = process.env.EVOLUTION_API_KEY?.trim() ?? "";

  const baseUrl = stripQuotes(rawUrl).replace(/\/$/, "");
  const apiKey  = stripQuotes(rawKey);

  if (!baseUrl || !apiKey) {
    throw new EvolutionApiError(
      "خدمة WhatsApp غير مُهيأة — يرجى إضافة EVOLUTION_API_URL و EVOLUTION_API_KEY في إعدادات Railway",
      503
    );
  }

  // Diagnostic log: shows first 6 chars of key + URL (safe for server logs)
  console.info("[EvolutionClient] config loaded", {
    baseUrl,
    apiKeyPrefix: apiKey.slice(0, 6) + "…",
    apiKeyLength: apiKey.length,
  });

  return { baseUrl, apiKey };
}

function makeClient(config: EvolutionConfig): AxiosInstance {
  const instance = axios.create({
    baseURL: config.baseUrl,
    headers: {
      apikey: config.apiKey,
      "Content-Type": "application/json",
    },
    timeout: 25_000,
  });

  // Translate all Axios errors to user-friendly Arabic EvolutionApiErrors
  instance.interceptors.response.use(
    (r) => r,
    (err: unknown) => {
      // Network-level failure (no HTTP response received)
      if (
        err &&
        typeof err === "object" &&
        "response" in err &&
        !(err as { response: unknown }).response
      ) {
        const code = (err as { code?: string }).code ?? "";
        if (
          code === "ECONNREFUSED" ||
          code === "ENOTFOUND" ||
          code === "ECONNRESET"
        ) {
          throw new EvolutionApiError(
            "لا يمكن الوصول إلى خدمة Evolution API — تأكد من أن الخدمة تعمل على Railway",
            0
          );
        }
        if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
          throw new EvolutionApiError(
            "انتهت مهلة الاتصال بـ Evolution API — الخدمة بطيئة أو لا تستجيب",
            0
          );
        }
        const msg =
          (err as { message?: string }).message ?? "network error";
        throw new EvolutionApiError(
          `فشل الاتصال بـ Evolution API: ${msg}`,
          0
        );
      }

      // HTTP response received but with error status
      const status: number =
        (err as { response?: { status?: number } }).response?.status ?? 0;

      // Extract Evolution API's own error message from the response body.
      // Evolution API v2 uses several different shapes:
      //   { message: "..." }                        — simple
      //   { error: "Forbidden", response: { message: ["..."] } }  — 403 shape
      //   { message: ["..."] }                      — array variant
      const rawBody = (err as { response?: { data?: unknown } }).response?.data;
      const evolutionMsg: string | null = (() => {
        if (!rawBody || typeof rawBody !== "object") return null;
        const b = rawBody as Record<string, unknown>;
        // Direct string message
        if (typeof b.message === "string" && b.message) return b.message;
        // Direct array message (first element)
        if (Array.isArray(b.message) && typeof b.message[0] === "string") return b.message[0] as string;
        // Nested response.message array — the 403 "name already in use" shape
        const nested = b.response as Record<string, unknown> | undefined;
        if (nested) {
          if (typeof nested.message === "string" && nested.message) return nested.message;
          if (Array.isArray(nested.message) && typeof nested.message[0] === "string") return nested.message[0] as string;
        }
        // Fallback: error field
        if (typeof b.error === "string" && b.error) return b.error;
        return null;
      })();

      // Full raw dump — critical for diagnosing pairing-code failures
      console.log("[DEBUG-WHATSAPP] interceptor caught HTTP error", {
        status,
        url: (err as { config?: { url?: string } }).config?.url ?? "?",
        evolutionMsg,
        fullBody: JSON.stringify(rawBody ?? null),
      });

      if (status === 502 || status === 503 || status === 504) {
        throw new EvolutionApiError(
          `خدمة WhatsApp غير متوفرة حالياً (${status}) — تحقق من حالة خدمة Evolution API على Railway`,
          status
        );
      }

      // 401 = definitively wrong API key
      if (status === 401) {
        throw new EvolutionApiError(
          "مفتاح EVOLUTION_API_KEY غير صحيح أو لم يُعيَّن بشكل صحيح — تأكد من تطابق المفتاح في كلا الخدمتين على Railway",
          401
        );
      }

      // 403 = forbidden action (NOT necessarily wrong key)
      // Evolution API returns 403 for many reasons: instance already connected,
      // wrong phone format, endpoint not available in current state, etc.
      if (status === 403) {
        const detail = evolutionMsg ? `: ${evolutionMsg}` : "";
        throw new EvolutionApiError(
          `طلب مرفوض من Evolution API (403)${detail}`,
          403
        );
      }

      // 404 = instance doesn't exist yet (still initializing) or wrong path
      if (status === 404) {
        const detail = evolutionMsg ? `: ${evolutionMsg}` : "";
        throw new EvolutionApiError(
          `الجلسة غير موجودة في Evolution API (404)${detail} — ربما لم تنتهِ من الإعداد بعد`,
          404
        );
      }

      // Re-throw everything else (409, 422, etc.) as-is for callers to handle
      throw err;
    }
  );

  return instance;
}

export class EvolutionClient {
  private readonly client: AxiosInstance;
  private readonly config: EvolutionConfig;

  constructor(config?: EvolutionConfig) {
    this.config = config ?? resolveEvolutionConfig();
    this.client = makeClient(this.config);
  }

  /** Create a new instance (no QR — pairing code flow). */
  async createInstance(instanceName: string): Promise<EvolutionInstanceInfo> {
    const res = await this.client.post<EvolutionInstanceInfo>(
      "/instance/create",
      {
        instanceName,
        qrcode: false,
        integration: "WHATSAPP-BAILEYS",
      }
    );
    return res.data;
  }

  /**
   * Request pairing code for a phone number.
   * Phone must be digits only, international format (e.g. 963912345678).
   *
   * Evolution API v2 uses GET /instance/connect/{name}?number={phone}
   * (POST /instance/connect is not registered → "Cannot POST" 404).
   * Response shape: { pairingCode: "XXXXXXXX" } or { code: "XXXXXXXX" }
   */
  async getPairingCode(
    instanceName: string,
    phoneNumber: string
  ): Promise<string> {
    const res = await this.client.get<EvolutionPairingCodeResponse>(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
      { params: { number: phoneNumber } }
    );
    const code = res.data?.pairingCode ?? res.data?.code;
    if (!code) {
      console.warn(
        "[EvolutionClient] getPairingCode unexpected response body:",
        JSON.stringify(res.data)
      );
      throw new EvolutionApiError(
        "لم تُرجع Evolution API رمز الإقران — تحقق من صحة رقم الهاتف وأن الجلسة في حالة جاهزة",
        0
      );
    }
    return code;
  }

  /** Poll connection state. */
  async getConnectionState(
    instanceName: string
  ): Promise<EvolutionConnectionState["instance"]["state"]> {
    const res = await this.client.get<EvolutionConnectionState>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`
    );
    return res.data?.instance?.state ?? "close";
  }

  /** Logout (disconnect) instance. */
  async logoutInstance(instanceName: string): Promise<void> {
    await this.client.delete(
      `/instance/logout/${encodeURIComponent(instanceName)}`
    );
  }

  /** Delete instance entirely. */
  async deleteInstance(instanceName: string): Promise<void> {
    await this.client.delete(
      `/instance/delete/${encodeURIComponent(instanceName)}`
    );
  }

  /** Fetch all groups for the instance. */
  async fetchAllGroups(instanceName: string): Promise<EvolutionGroup[]> {
    const res = await this.client.get<EvolutionGroup[]>(
      `/group/fetchAllGroups/${encodeURIComponent(instanceName)}`,
      { params: { getParticipants: false } }
    );
    return Array.isArray(res.data) ? res.data : [];
  }

  /**
   * Send a PNG image buffer to a group.
   * Evolution API expects base64-encoded media.
   */
  async sendImageToGroup(
    instanceName: string,
    groupJid: string,
    imageBuffer: Buffer,
    caption?: string
  ): Promise<EvolutionSendMediaResponse> {
    const base64 = imageBuffer.toString("base64");
    const res = await this.client.post<EvolutionSendMediaResponse>(
      `/message/sendMedia/${encodeURIComponent(instanceName)}`,
      {
        number: groupJid,
        mediatype: "image",
        mimetype: "image/png",
        media: base64,
        caption: caption ?? "",
        fileName: "texas-report.png",
      }
    );
    return res.data;
  }

  /**
   * Lightweight ping — verifies the Evolution API service is reachable.
   * GET / is a public endpoint; any 2xx/4xx (except 5xx) means the server is alive.
   * NOTE: this does NOT verify the API key — use testAuth() for that.
   */
  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.client.get("/");
      return { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      // Our interceptor already converted 401/403/5xx to EvolutionApiError
      if (e instanceof EvolutionApiError) {
        // Service is reachable if it returned a non-5xx HTTP status
        const alive = e.httpStatus > 0 && e.httpStatus < 500;
        return {
          ok: alive,
          latencyMs: Date.now() - start,
          error: alive ? undefined : e.message,
        };
      }
      const msg = (e as { message?: string }).message ?? "unknown error";
      return { ok: false, latencyMs: Date.now() - start, error: msg };
    }
  }

  /**
   * Verify the API key is accepted by Evolution API.
   * Calls GET /instance/fetchInstances which requires a valid apikey header.
   */
  async testAuth(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.client.get("/instance/fetchInstances");
      return { valid: true };
    } catch (e) {
      if (e instanceof EvolutionApiError) {
        // 401 = definitely wrong key; 403 = forbidden (might still be valid key)
        if (e.httpStatus === 401) {
          return { valid: false, error: e.message };
        }
        // Any other error (404, 403, etc.) → key was accepted, endpoint might differ
        return { valid: true };
      }
      const msg = (e as { message?: string }).message ?? "unknown";
      return { valid: false, error: msg };
    }
  }

  /**
   * Send a plain-text message to a phone number or group JID.
   * For personal numbers use: "9639XXXXXXXX@s.whatsapp.net"
   * For groups: "XXXXXXXXXX@g.us"
   */
  async sendTextMessage(
    instanceName: string,
    jid: string,
    text: string
  ): Promise<void> {
    await this.client.post(
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      { number: jid, text }
    );
  }

  /**
   * Register a webhook for message events on the instance.
   * Call once after connecting.
   */
  /**
   * Evolution API v2 requires the webhook config nested under a "webhook" key.
   * v1 sent flat JSON — v2 rejects that with HTTP 400 "instance requires property webhook".
   */
  async setWebhook(
    instanceName: string,
    webhookUrl: string
  ): Promise<void> {
    await this.client.post(
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      {
        webhook: {
          url: webhookUrl,
          enabled: true,
          webhookByEvents: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }
    );
  }
}

/** Singleton — constructed lazily on first use. */
let _client: EvolutionClient | null = null;

export function getEvolutionClient(): EvolutionClient {
  if (!_client) _client = new EvolutionClient();
  return _client;
}
