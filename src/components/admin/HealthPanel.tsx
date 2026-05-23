"use client";

import { Activity, AlertTriangle, CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { useAdminHealth } from "@/hooks/use-admin-api";

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400"
          : "inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-400"
      }
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function HealthPanel() {
  const health = useAdminHealth();

  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading system health…
      </div>
    );
  }

  if (health.isError || !health.data) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load health status.
      </div>
    );
  }

  const h = health.data;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-gold" />
          Runtime
        </h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Railway</dt>
            <dd>{h.runtime.railway ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Node</dt>
            <dd className="font-mono">{h.runtime.nodeVersion}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Uptime</dt>
            <dd>{Math.floor(h.runtime.uptimeSec / 60)} min</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scraper circuit</dt>
            <dd>
              <StatusBadge
                ok={!h.scraperCircuit.open}
                label={h.scraperCircuit.open ? "OPEN" : "closed"}
              />
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-gold" />
          WhatsApp (WASenderAPI)
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge ok={h.whatsapp.configured} label="Configured" />
          <StatusBadge ok={h.whatsapp.reachable} label="Reachable" />
          {h.whatsapp.latencyMs != null && (
            <span className="text-muted-foreground">{h.whatsapp.latencyMs}ms</span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{h.whatsapp.message}</p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Texas sync</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Last success</dt>
            <dd className="font-mono text-xs">
              {h.texasSync.lastSuccessAt ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last failure</dt>
            <dd className="font-mono text-xs">
              {h.texasSync.lastFailureAt ?? "—"}
            </dd>
          </div>
        </dl>
        {h.texasSync.recentFailures.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {h.texasSync.recentFailures.map((f, i) => (
              <li key={`${f.ts}-${i}`} className="font-mono">
                {f.ts} · user {f.userId}… · {f.error ?? "unknown"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Onboarding</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Pending 😎</dt>
            <dd className="text-lg font-semibold">{h.onboarding.pendingEmojiCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Verified</dt>
            <dd className="text-lg font-semibold">{h.onboarding.verifiedCount}</dd>
          </div>
        </dl>
      </section>

      {h.webhooks.recentFailures.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Recent webhook failures</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {h.webhooks.recentFailures.map((f, i) => (
              <li key={`${f.ts}-${i}`} className="font-mono">
                [{f.source}] {f.step}: {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Refreshed {new Date(h.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
