/**
 * GET /api/whatsapp/health
 * Public diagnostic endpoint — checks if Evolution API is configured and reachable.
 * Used by the UI to show a clear error before the user tries to connect.
 */
import { isEvolutionConfigured, getEvolutionClient } from "@/lib/whatsapp/evolution-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isEvolutionConfigured()) {
    return Response.json(
      {
        ok: false,
        configured: false,
        reachable: false,
        error: "خدمة WhatsApp غير مُهيأة — يرجى إضافة EVOLUTION_API_URL و EVOLUTION_API_KEY في إعدادات Railway",
        hint:  "Set EVOLUTION_API_URL and EVOLUTION_API_KEY environment variables on the Railway service.",
      },
      { status: 503 }
    );
  }

  const client = getEvolutionClient();

  // Step 1: check the service is reachable (network-level)
  const ping = await client.ping();
  if (!ping.ok) {
    return Response.json(
      {
        ok: false,
        configured: true,
        reachable: false,
        keyValid: false,
        latencyMs: ping.latencyMs,
        error: ping.error ?? "Evolution API لا تستجيب",
        hint:  "Check that the evolution-api Railway service is running and EVOLUTION_API_URL is correct.",
      },
      { status: 502 }
    );
  }

  // Step 2: verify the API key is accepted by an authenticated endpoint
  const auth = await client.testAuth();
  if (!auth.valid) {
    return Response.json(
      {
        ok: false,
        configured: true,
        reachable: true,
        keyValid: false,
        latencyMs: ping.latencyMs,
        error: auth.error ?? "مفتاح EVOLUTION_API_KEY غير صحيح",
        hint:  "Ensure EVOLUTION_API_KEY matches AUTHENTICATION_API_KEY on the evolution-api service (no surrounding quotes).",
      },
      { status: 401 }
    );
  }

  return Response.json({
    ok: true,
    configured: true,
    reachable: true,
    keyValid: true,
    latencyMs: ping.latencyMs,
  });
}
