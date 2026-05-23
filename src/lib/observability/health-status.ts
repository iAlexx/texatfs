import type { SupabaseClient } from "@supabase/supabase-js";
import { getScraperCircuitStatus } from "@/lib/scraper/stable-scraper-wrapper";
import { isRailwayRuntime } from "@/lib/texas/texas-browser-config";
import { getRecentWebhookFailures } from "@/lib/observability/webhook-events";
import { checkWhatsAppGatewayHealth } from "@/lib/whatsapp/health-check";

export type HealthStatusLevel = "green" | "yellow" | "red";

export interface AdminHealthStatus {
  timestamp: string;
  runtime: {
    railway: boolean;
    nodeVersion: string;
    uptimeSec: number;
  };
  whatsapp: Awaited<ReturnType<typeof checkWhatsAppGatewayHealth>> & {
    level: HealthStatusLevel;
  };
  texasSync: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    level: HealthStatusLevel;
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
  ledger: {
    openDiscrepancyCount: number;
  };
  webhooks: {
    recentFailures: ReturnType<typeof getRecentWebhookFailures>;
    level: HealthStatusLevel;
  };
  scraperCircuit: ReturnType<typeof getScraperCircuitStatus> & {
    open: boolean;
    level: HealthStatusLevel;
  };
}

function syncHealthLevel(
  lastSuccessAt: string | null,
  lastFailureAt: string | null
): HealthStatusLevel {
  if (!lastSuccessAt && !lastFailureAt) return "yellow";
  if (!lastSuccessAt) return "red";
  if (!lastFailureAt) return "green";
  const successTs = new Date(lastSuccessAt).getTime();
  const failureTs = new Date(lastFailureAt).getTime();
  if (failureTs > successTs) return "red";
  const ageHours = (Date.now() - successTs) / (1000 * 60 * 60);
  if (ageHours > 26) return "yellow";
  return "green";
}

export async function loadAdminHealthStatus(
  supabase: SupabaseClient
): Promise<AdminHealthStatus> {
  const [whatsapp, syncLogs, onboardingRows, discrepancyCount] =
    await Promise.all([
      checkWhatsAppGatewayHealth(),
      supabase
        .from("sync_logs")
        .select("created_at, status, user_id, error_message")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("users")
        .select("onboarding_status")
        .in("onboarding_status", ["PENDING_EMOJI", "VERIFIED_COMPLETED"]),
      supabase
        .from("daily_ledgers")
        .select("id", { count: "exact", head: true })
        .eq("discrepancy_flag", true)
        .eq("status", "open"),
    ]);

  const rows = syncLogs.data ?? [];
  const lastSuccess = rows.find((r) => r.status === "success");
  const lastFailure = rows.find((r) => r.status === "failed");
  const recentWebhookFailures = getRecentWebhookFailures(10);

  const onboardingCounts = { pendingEmojiCount: 0, verifiedCount: 0 };
  for (const row of onboardingRows.data ?? []) {
    if (row.onboarding_status === "PENDING_EMOJI") onboardingCounts.pendingEmojiCount++;
    if (row.onboarding_status === "VERIFIED_COMPLETED") onboardingCounts.verifiedCount++;
  }

  const scraperCircuit = getScraperCircuitStatus();
  const circuitOpen = Boolean(
    scraperCircuit.openUntil && scraperCircuit.openUntil > Date.now()
  );

  const whatsappLevel: HealthStatusLevel = !whatsapp.configured
    ? "red"
    : whatsapp.reachable
      ? "green"
      : "yellow";

  const syncLevel = syncHealthLevel(
    lastSuccess?.created_at ?? null,
    lastFailure?.created_at ?? null
  );

  const webhookLevel: HealthStatusLevel =
    recentWebhookFailures.length >= 5
      ? "red"
      : recentWebhookFailures.length > 0
        ? "yellow"
        : "green";

  return {
    timestamp: new Date().toISOString(),
    runtime: {
      railway: isRailwayRuntime(),
      nodeVersion: process.version,
      uptimeSec: Math.floor(process.uptime()),
    },
    whatsapp: { ...whatsapp, level: whatsappLevel },
    texasSync: {
      lastSuccessAt: lastSuccess?.created_at ?? null,
      lastFailureAt: lastFailure?.created_at ?? null,
      level: syncLevel,
      recentFailures: rows
        .filter((r) => r.status === "failed")
        .slice(0, 5)
        .map((r) => ({
          ts: r.created_at,
          userId: String(r.user_id).slice(0, 8),
          error: r.error_message,
        })),
    },
    onboarding: onboardingCounts,
    ledger: {
      openDiscrepancyCount: discrepancyCount.count ?? 0,
    },
    webhooks: {
      recentFailures: recentWebhookFailures,
      level: webhookLevel,
    },
    scraperCircuit: {
      ...scraperCircuit,
      open: circuitOpen,
      level: circuitOpen ? "red" : "green",
    },
  };
}
