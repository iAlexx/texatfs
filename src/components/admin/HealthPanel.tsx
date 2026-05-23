"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
} from "lucide-react";
import type { HealthStatusLevel } from "@/lib/observability/health-status";
import { useAdminHealth } from "@/hooks/use-admin-api";

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function LevelDot({ level }: { level: HealthStatusLevel }) {
  const colors = {
    green: "bg-emerald-400 ring-emerald-400/30",
    yellow: "bg-amber-400 ring-amber-400/30",
    red: "bg-rose-400 ring-rose-400/30",
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${colors[level]}`}
      title={level}
    />
  );
}

function SectionHeader({
  title,
  level,
  icon: Icon,
}: {
  title: string;
  level: HealthStatusLevel;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-gold" />
      {title}
      <LevelDot level={level} />
    </h3>
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
        <SectionHeader
          title="Runtime"
          level={h.scraperCircuit.level}
          icon={Activity}
        />
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
            <dd className="flex items-center gap-2">
              {h.scraperCircuit.open ? (
                <span className="text-rose-400">OPEN</span>
              ) : (
                <span className="text-emerald-400">closed</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <SectionHeader
          title="WhatsApp (WASenderAPI)"
          level={h.whatsapp.level}
          icon={MessageCircle}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            {h.whatsapp.configured ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            )}
            {h.whatsapp.configured ? "Token set" : "Not configured"}
          </span>
          {h.whatsapp.latencyMs != null && (
            <span className="text-muted-foreground">{h.whatsapp.latencyMs}ms</span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{h.whatsapp.message}</p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <SectionHeader title="Texas sync" level={h.texasSync.level} icon={Activity} />
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Last success</dt>
            <dd className="text-xs">{formatTs(h.texasSync.lastSuccessAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last failure</dt>
            <dd className="text-xs">{formatTs(h.texasSync.lastFailureAt)}</dd>
          </div>
        </dl>
        {h.texasSync.recentFailures.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {h.texasSync.recentFailures.map((f, i) => (
              <li key={`${f.ts}-${i}`} className="font-mono">
                {formatTs(f.ts)} · user {f.userId}… · {f.error ?? "unknown"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Ledger integrity</h3>
        <p className="text-sm">
          Open ledgers with discrepancy flag:{" "}
          <span
            className={
              h.ledger.openDiscrepancyCount > 0
                ? "font-semibold text-amber-400"
                : "font-semibold text-emerald-400"
            }
          >
            {h.ledger.openDiscrepancyCount}
          </span>
        </p>
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

      <section className="rounded-lg border border-border bg-card p-4">
        <SectionHeader
          title="Webhook failures (since deploy)"
          level={h.webhooks.level}
          icon={AlertTriangle}
        />
        {h.webhooks.recentFailures.length === 0 ? (
          <p className="text-xs text-muted-foreground">No recent failures recorded.</p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {h.webhooks.recentFailures.map((f, i) => (
              <li key={`${f.ts}-${i}`} className="font-mono">
                {formatTs(f.ts)} · [{f.source}] {f.step}: {f.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Refreshed {formatTs(h.timestamp)} · auto-refresh every 60s
      </p>
    </div>
  );
}
