/**
 * Lightweight WASenderAPI connectivity probe (read-only).
 */
import { createLogger } from "@/lib/observability/logger";
import { withTimeout } from "@/lib/utils/async-retry";

const log = createLogger("whatsapp/health");

const DEFAULT_BASE_URL = "https://api.wasenderapi.com";
const HEALTH_TIMEOUT_MS = 8_000;

export interface WhatsAppHealthStatus {
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  message: string;
}

export async function checkWhatsAppGatewayHealth(): Promise<WhatsAppHealthStatus> {
  const token = process.env.WHATSAPP_API_TOKEN?.trim();
  if (!token) {
    return {
      configured: false,
      reachable: false,
      latencyMs: null,
      statusCode: null,
      message: "WHATSAPP_API_TOKEN not set",
    };
  }

  const baseUrl = process.env.WHATSAPP_API_URL?.trim() || DEFAULT_BASE_URL;
  const started = Date.now();

  try {
    const res = await withTimeout(
      fetch(`${baseUrl}/api/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
      HEALTH_TIMEOUT_MS,
      "whatsapp-health"
    );

    const latencyMs = Date.now() - started;
    const ok = res.status >= 200 && res.status < 500;

    return {
      configured: true,
      reachable: ok,
      latencyMs,
      statusCode: res.status,
      message: ok ? "Gateway reachable" : `Unexpected status ${res.status}`,
    };
  } catch (err) {
    log.warn("health check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - started,
      statusCode: null,
      message: err instanceof Error ? err.message : "Health check failed",
    };
  }
}
