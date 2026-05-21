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
  const result = await client.ping();

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        configured: true,
        reachable: false,
        latencyMs: result.latencyMs,
        error: result.error ?? "Evolution API لا تستجيب",
        hint:  "Check that the evolution-api Railway service is running and EVOLUTION_API_URL is correct.",
      },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    configured: true,
    reachable: true,
    latencyMs: result.latencyMs,
  });
}
