import type { SupabaseClient } from "@supabase/supabase-js";
import { getScraperCircuitStatus } from "@/lib/scraper/stable-scraper-wrapper";
import { isRailwayRuntime } from "@/lib/texas/texas-browser-config";
import { getRecentWebhookFailures } from "@/lib/observability/webhook-events";
import { checkWhatsAppGatewayHealth } from "@/lib/whatsapp/health-check";

export interface AdminHealthStatus {
  timestamp: string;
  runtime: {
    railway: boolean;
    nodeVersion: string;
    uptimeSec: number;
  };
  whatsapp: Awaited<ReturnType<typeof checkWhatsAppGatewayHealth>>;
  texasSync: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    recentFailures: Array<{
      ts: string;
      userId: string;
      error: string | null;
    }>;
  };
  onboarding: {
    pendingEmojiCount: number;
    verifiedCount: number;
  };
  webhooks: {
    recentFailures: ReturnType<typeof getRecentWebhookFailures>;
  };
  scraperCircuit: ReturnType<typeof getScraperCircuitStatus> & {
    open: boolean;
  };
}

export async function loadAdminHealthStatus(
  supabase: SupabaseClient
): Promise<AdminHealthStatus> {
  const [whatsapp, syncLogs, pendingCount, verifiedCount] = await Promise.all([
    checkWhatsAppGatewayHealth(),
    supabase
      .from("sync_logs")
      .select("created_at, status, user_id, error_message")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("onboarding_status", "PENDING_EMOJI"),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("onboarding_status", "VERIFIED_COMPLETED"),
  ]);

  const rows = syncLogs.data ?? [];
  const lastSuccess = rows.find((r) => r.status === "success");
  const lastFailure = rows.find((r) => r.status === "failed");

  const scraperCircuit = getScraperCircuitStatus();

  return {
    timestamp: new Date().toISOString(),
    runtime: {
      railway: isRailwayRuntime(),
      nodeVersion: process.version,
      uptimeSec: Math.floor(process.uptime()),
    },
    whatsapp,
    texasSync: {
      lastSuccessAt: lastSuccess?.created_at ?? null,
      lastFailureAt: lastFailure?.created_at ?? null,
      recentFailures: rows
        .filter((r) => r.status === "failed")
        .slice(0, 5)
        .map((r) => ({
          ts: r.created_at,
          userId: String(r.user_id).slice(0, 8),
          error: r.error_message,
        })),
    },
    onboarding: {
      pendingEmojiCount: pendingCount.count ?? 0,
      verifiedCount: verifiedCount.count ?? 0,
    },
    webhooks: {
      recentFailures: getRecentWebhookFailures(10),
    },
    scraperCircuit: {
      ...scraperCircuit,
      open: Boolean(scraperCircuit.openUntil && scraperCircuit.openUntil > Date.now()),
    },
  };
}
