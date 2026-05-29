"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, RefreshCw } from "lucide-react";
import { LedgerHistoryNav } from "@/components/ledger/LedgerHistoryNav";
import { LedgerTabBar, type LedgerTabId } from "@/components/ledger/LedgerTabBar";
import { SubAgentsTabPanel } from "@/components/ledger/SubAgentsTabPanel";
import { SubscriptionExpiredOverlay } from "@/components/ledger/SubscriptionExpiredOverlay";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/components/providers/TelegramProvider";
import {
  useLedgerHistory,
  useLedgerSession,
  todayIsoDate,
} from "@/hooks/use-ledger-api";
import { useTexasSubAgents } from "@/hooks/use-texas-agents-api";
import { canManageNetwork } from "@/lib/hierarchy/subtree-rules";
import { ar } from "@/lib/i18n/ar";
import { formatLedgerDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function DailyLedgerView({ embedded = false }: { embedded?: boolean }) {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate);
  const [activeTab, setActiveTab] = useState<LedgerTabId>("agents");
  const [forceRefreshSubAgents, setForceRefreshSubAgents] = useState(false);
  const telegram = useTelegram();
  const history = useLedgerHistory();
  const isToday = selectedDate === todayIsoDate();

  const session = useLedgerSession(selectedDate, null, {
    forceSync: false,
    viewMode: "monthly",
  });

  const showAgentsTab = session.data?.user
    ? canManageNetwork(session.data.user.role)
    : false;

  const subAgentsQuery = useTexasSubAgents(
    selectedDate,
    telegram.isReady && telegram.canAuthenticate && showAgentsTab,
    forceRefreshSubAgents
  );

  function handleRefresh() {
    if (showAgentsTab) {
      setForceRefreshSubAgents(true);
      void subAgentsQuery.refetch().finally(() => setForceRefreshSubAgents(false));
    }
  }

  if (!telegram.isReady) {
    return (
      <ExecutiveShell title={ar.loading} embedded={embedded}>
        <motion.div
          className="flex items-center justify-center gap-2 py-20 text-steel-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          <Loader2 className="h-5 w-5 animate-spin text-gold" strokeWidth={1.5} />
          <span className="text-sm">{ar.loadingLedger}</span>
        </motion.div>
      </ExecutiveShell>
    );
  }

  if (!telegram.canAuthenticate) {
    return (
      <ExecutiveShell title="خطأ" embedded={embedded}>
        <p className="text-accent-negative">
          {telegram.authError ?? ar.errorGeneric}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 border-steel-border"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          {ar.retry}
        </Button>
      </ExecutiveShell>
    );
  }

  if (session.isLoading && !session.data) {
    return (
      <ExecutiveShell title={ar.loading} embedded={embedded}>
        <motion.div
          className="flex flex-col items-center justify-center gap-2 py-20 text-steel-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          <Loader2 className="h-5 w-5 animate-spin text-gold" strokeWidth={1.5} />
          <span className="text-sm">{ar.loadingSubAgents}</span>
        </motion.div>
      </ExecutiveShell>
    );
  }

  if (session.subscriptionExpired && session.data?.user) {
    return (
      <>
        <ExecutiveShell title={ar.dailyLedger} embedded={embedded}>
          <p className="text-steel-500">{ar.accessSuspended}</p>
        </ExecutiveShell>
        <SubscriptionExpiredOverlay
          subscriptionEndDate={session.data.user.subscription_end_date}
        />
      </>
    );
  }

  if (session.error) {
    return (
      <ExecutiveShell title="خطأ" embedded={embedded}>
        <p className="text-accent-negative">{session.error}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 border-steel-border"
          onClick={() => void session.refresh()}
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          {ar.retry}
        </Button>
      </ExecutiveShell>
    );
  }

  const user = session.data?.user;

  return (
    <ExecutiveShell
      title={ar.subAgentsTitle}
      subtitle={`${ar.subAgentsMtdSubtitle} · ${formatLedgerDate(selectedDate)}`}
      onRefresh={isToday && showAgentsTab ? handleRefresh : undefined}
      refreshing={subAgentsQuery.isFetching}
      embedded={embedded}
    >
      <LedgerHistoryNav
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        history={history.data?.dates ?? []}
        isLoading={history.isLoading}
      />

      <LedgerTabBar
        active={activeTab}
        onChange={setActiveTab}
        showAgentsTab={showAgentsTab}
        hideAccountTab
        agentsOnly
      />

      {activeTab === "agents" ? (
        showAgentsTab ? (
          <SubAgentsTabPanel
            data={subAgentsQuery.data}
            isLoading={subAgentsQuery.isLoading}
            error={subAgentsQuery.error}
            onRetry={() => void subAgentsQuery.refetch()}
          />
        ) : (
          <motion.div
            className="glass-panel mb-4 px-4 py-12 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-sm text-steel-400">{ar.noSubAgents}</p>
          </motion.div>
        )
      ) : null}

      {activeTab === "history" ? (
        <motion.div
          className="glass-panel mb-4 px-4 py-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-sm text-steel-400">{ar.ledgerHistoryHint}</p>
          {history.data?.dates?.length ? (
            <ul className="mt-4 space-y-2 text-right">
              {history.data.dates.slice(0, 12).map((entry) => (
                <li key={entry.ledger_date}>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(entry.ledger_date)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-sm transition-colors",
                      entry.ledger_date === selectedDate
                        ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-white/[0.06] text-steel-400 hover:border-gold/20"
                    )}
                  >
                    {formatLedgerDate(entry.ledger_date)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </motion.div>
      ) : null}

      {user && (
        <footer className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-steel-600">
          <span>{user.display_name ?? user.texas_username}</span>
          <span className="text-gold/70">
            {user.role === "master"
              ? ar.roleMaster
              : user.role === "agent"
                ? ar.roleAgent
                : user.role === "player"
                  ? ar.rolePlayer
                  : ar.roleSuperMaster}
          </span>
        </footer>
      )}
    </ExecutiveShell>
  );
}

function ExecutiveShell({
  title,
  subtitle,
  onRefresh,
  refreshing,
  embedded,
  children,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  embedded?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-md px-4",
        embedded ? "pb-4 pt-4" : "executive-bg min-h-screen pb-12 pt-6"
      )}
    >
      <motion.header
        className={embedded ? "mb-4" : "mb-6"}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className={cn(
            "flex items-start justify-between gap-3 p-4",
            embedded ? "glass-inner rounded-2xl" : "glass-panel-gold"
          )}
        >
          <div>
            {!embedded && (
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold/70">
                {ar.brandEn}
              </p>
            )}
            <h1
              className={cn(
                "font-bold",
                embedded ? "text-lg text-gold" : "mt-1 text-2xl ledger-title-gold"
              )}
            >
              {embedded ? title : ar.brand}
            </h1>
            <p className="mt-0.5 text-sm text-steel-400">
              {embedded ? (subtitle ?? title) : title}
            </p>
            {!embedded && subtitle && (
              <p className="mt-1 text-xs text-steel-600">{subtitle}</p>
            )}
          </div>
          {onRefresh && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-steel-500 hover:text-gold"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
                strokeWidth={1.5}
              />
            </Button>
          )}
        </div>
      </motion.header>
      {children}
    </div>
  );
}
