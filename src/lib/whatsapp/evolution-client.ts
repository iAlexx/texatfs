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
  code: string;
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

function resolveEvolutionConfig(): EvolutionConfig {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, "");
  const apiKey  = process.env.EVOLUTION_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    throw new EvolutionApiError(
      "خدمة WhatsApp غير مُهيأة — يرجى إضافة EVOLUTION_API_URL و EVOLUTION_API_KEY في إعدادات Railway",
      503
    );
  }
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

      if (status === 502 || status === 503 || status === 504) {
        throw new EvolutionApiError(
          `خدمة WhatsApp غير متوفرة حالياً (${status}) — تحقق من حالة خدمة Evolution API على Railway`,
          status
        );
      }
      if (status === 401 || status === 403) {
        throw new EvolutionApiError(
          "مفتاح EVOLUTION_API_KEY غير صحيح أو منتهي الصلاحية",
          status
        );
      }
      // Re-throw everything else (404, 422, etc.) as-is for callers to handle
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

  /** Get pairing code for a phone number (format: 905xxxxxxxxx). */
  async getPairingCode(
    instanceName: string,
    phoneNumber: string
  ): Promise<string> {
    const res = await this.client.post<EvolutionPairingCodeResponse>(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
      { number: phoneNumber }
    );
    if (!res.data?.code) {
      throw new Error(
        `Evolution API did not return a pairing code for ${instanceName}`
      );
    }
    return res.data.code;
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
  async setWebhook(
    instanceName: string,
    webhookUrl: string
  ): Promise<void> {
    await this.client.post(
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      {
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
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
