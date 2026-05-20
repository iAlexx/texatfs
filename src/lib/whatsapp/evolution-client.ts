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

function resolveEvolutionConfig(): EvolutionConfig {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, "");
  const apiKey  = process.env.EVOLUTION_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    throw new Error(
      "EVOLUTION_API_URL and EVOLUTION_API_KEY must be set in environment"
    );
  }
  return { baseUrl, apiKey };
}

function makeClient(config: EvolutionConfig): AxiosInstance {
  return axios.create({
    baseURL: config.baseUrl,
    headers: {
      apikey: config.apiKey,
      "Content-Type": "application/json",
    },
    timeout: 20_000,
  });
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
