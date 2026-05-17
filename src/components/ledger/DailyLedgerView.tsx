"use client";

import type { ReactNode } from "react";
import { LedgerRow } from "@/components/ledger/LedgerRow";
import { SubscriptionExpiredOverlay } from "@/components/ledger/SubscriptionExpiredOverlay";
import { useDailyLedgerRealtime } from "@/hooks/useDailyLedgerRealtime";
import { formatLedgerDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function DailyLedgerView() {
  const { data, loading, error, subscriptionExpired, refresh } =
    useDailyLedgerRealtime();

  if (loading) {
    return <LedgerShell title="جاري التحميل…">Loading ledger…</LedgerShell>;
  }

  if (subscriptionExpired && data?.user) {
    return (
      <>
        <LedgerShell title="السجل اليومي">
          <p className="text-steel-500">Access suspended.</p>
        </LedgerShell>
        <SubscriptionExpiredOverlay
          subscriptionEndDate={data.user.subscription_end_date}
        />
      </>
    );
  }

  if (error) {
    return (
      <LedgerShell title="خطأ">
        <p className="text-accent-negative">{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-4 border border-steel-border px-4 py-2 text-sm text-steel-400"
        >
          Retry
        </button>
      </LedgerShell>
    );
  }

  if (!data?.ledger) {
    return (
      <LedgerShell title="لا توجد بيانات">
        No ledger data for today.
      </LedgerShell>
    );
  }

  const { ledger, user } = data;

  return (
    <LedgerShell
      title="السجل اليومي"
      subtitle={formatLedgerDate(ledger.ledger_date)}
      badge={ledger.status === "open" ? "OPEN" : "CLOSED"}
    >
      {ledger.discrepancy_flag && (
        <div className="mb-4 border border-accent-negative/40 bg-navy-700 px-4 py-2 text-sm text-accent-negative">
          تنبيه: يوجد فرق بين مصدر Texas وواصل WhatsApp
        </div>
      )}

      <section className="panel-steel overflow-hidden">
        <header className="border-b border-steel-border bg-navy-700/80 px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            Texas API movement
          </p>
        </header>
        <LedgerRow labelAr="تبات" labelEn="Tebat" value={ledger.tebat} />
        <LedgerRow labelAr="سحوبات" labelEn="Suhoubat" value={ledger.suhoubat} />
        <LedgerRow
          labelAr="الفرق"
          labelEn="Al-Farq"
          value={ledger.al_farq}
          variant="emphasis"
        />
        <LedgerRow labelAr="الحرق" labelEn="Al-Harq" value={ledger.al_harq} />
      </section>

      <section className="panel-steel mt-4 overflow-hidden">
        <header className="border-b border-steel-border bg-navy-700/80 px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            WhatsApp confirmations
          </p>
        </header>
        <LedgerRow
          labelAr="واصل منه"
          labelEn="Wasel Menho"
          value={ledger.wasel_menho}
          signed={false}
        />
        <LedgerRow
          labelAr="واصل إليه"
          labelEn="Wasel Eleih"
          value={ledger.wasel_eleih}
          signed={false}
        />
      </section>

      <section className="panel-steel mt-4 overflow-hidden">
        <header className="border-b border-steel-border bg-navy-700/80 px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            Balance
          </p>
        </header>
        <LedgerRow
          labelAr="باقي قديم"
          labelEn="Baqi Qadim"
          value={ledger.baqi_qadim}
          signed={false}
        />
        <LedgerRow
          labelAr="النهائي"
          labelEn="Al-Nihai"
          value={ledger.al_nihai}
          variant="final"
          signed={false}
        />
      </section>

      <footer className="mt-6 flex items-center justify-between text-xs text-steel-600">
        <span>{user.display_name ?? user.texas_username}</span>
        <span className="font-mono uppercase">{user.role.replace("_", " ")}</span>
      </footer>
    </LedgerShell>
  );
}

function LedgerShell({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-8 pt-6">
      <header className="mb-6 border-b border-steel-border pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-accent-highlight">
              TEXAS FUNDS
            </h1>
            <p className="mt-1 text-lg text-steel-400">{title}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-steel-600">{subtitle}</p>
            )}
          </div>
          {badge && (
            <span
              className={cn(
                "border px-2 py-0.5 font-mono text-[10px] tracking-widest",
                badge === "OPEN"
                  ? "border-accent-positive/50 text-accent-positive"
                  : "border-steel-muted text-steel-500"
              )}
            >
              {badge}
            </span>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
