"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { LedgerHistoryNav } from "@/components/ledger/LedgerHistoryNav";
import { ExecutiveLedgerReport } from "@/components/ledger/ExecutiveLedgerReport";
import { NetworkMapPanel } from "@/components/ledger/NetworkMapPanel";
import { SubAgentsBreakdown } from "@/components/ledger/SubAgentsBreakdown";
import { SubscriptionExpiredOverlay } from "@/components/ledger/SubscriptionExpiredOverlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/components/providers/TelegramProvider";
import {
  useLedgerHistory,
  useLedgerSession,
  todayIsoDate,
} from "@/hooks/use-ledger-api";
import { ar } from "@/lib/i18n/ar";
import { formatLedgerDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function DailyLedgerView({ embedded = false }: { embedded?: boolean }) {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [viewAgentLabel, setViewAgentLabel] = useState<string | null>(null);
  const telegram = useTelegram();
  const history = useLedgerHistory();
  const session = useLedgerSession(selectedDate, viewUserId);

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
  const ledger = session.data?.ledger;
  const network = session.data?.network;
  const hierarchy = session.data?.hierarchy;
  const canSeeNetwork =
    user?.role === "master" || user?.role === "super_master";
  const isToday = selectedDate === todayIsoDate();
  const viewingSubAgent = Boolean(
    viewUserId && user?.id && viewUserId !== user.id
  );

  return (
    <ExecutiveShell
      title={ar.dailyLedger}
      subtitle={
        viewingSubAgent && viewAgentLabel
          ? `${viewAgentLabel} · ${formatLedgerDate(selectedDate)}`
          : ledger
            ? formatLedgerDate(ledger.ledger_date)
            : formatLedgerDate(selectedDate)
      }
      badge={
        ledger?.status === "open"
          ? ar.statusOpen
          : ledger
            ? ar.statusClosed
            : undefined
      }
      onRefresh={isToday && !viewingSubAgent ? () => void session.refresh() : undefined}
      refreshing={session.isLoading}
      embedded={embedded}
    >
      {viewingSubAgent && viewAgentLabel ? (
        <motion.div
          className="mb-4 space-y-3"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-inner flex items-center justify-between gap-2 rounded-xl border border-lime/25 bg-lime/5 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-lime/80">
              {ar.viewingAgentData}
            </span>
            <span className="truncate text-sm font-semibold text-lime">
              {viewAgentLabel}
            </span>
          </div>
          <motion.button
            type="button"
            className="flex items-center gap-2 text-sm text-gold"
            onClick={() => {
              setViewUserId(null);
              setViewAgentLabel(null);
            }}
            whileTap={{ scale: 0.97 }}
          >
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            {ar.backToMaster}
          </motion.button>
        </motion.div>
      ) : null}

      <LedgerHistoryNav
        selectedDate={selectedDate}
        onSelectDate={(d) => {
          setSelectedDate(d);
          if (!viewingSubAgent) {
            setViewUserId(null);
            setViewAgentLabel(null);
          }
        }}
        history={history.data?.dates ?? []}
        isLoading={history.isLoading}
      />

      {!viewingSubAgent && canSeeNetwork && network ? (
        <NetworkMapPanel
          network={network}
          onSelectAgent={(id, label) => {
            setViewUserId(id);
            setViewAgentLabel(label);
          }}
        />
      ) : !viewingSubAgent && hierarchy && hierarchy.sub_agents.length > 0 ? (
        <SubAgentsBreakdown
          hierarchy={hierarchy}
          ledgerDate={selectedDate}
          onSelectAgent={(id, label) => {
            setViewUserId(id);
            setViewAgentLabel(label);
          }}
        />
      ) : null}

      <AnimatePresence mode="wait">
        {!ledger ? (
          <motion.div
            key="empty"
            className="glass-panel px-6 py-14 text-center"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-sm text-steel-400">{ar.noReportForDate}</p>
            {isToday && (
              <p className="mt-4 text-xs text-steel-500">{ar.reportPendingSync}</p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key={ledger.id}
            initial={{ opacity: 0, x: viewingSubAgent ? 12 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
          >
            <ExecutiveLedgerReport
              ledger={ledger}
              targetUserId={viewUserId ?? user?.id}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {user && (
        <footer className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-steel-600">
          <span>{user.display_name ?? user.texas_username}</span>
          <span className="text-gold/70">
            {user.role === "master"
              ? ar.roleMaster
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
  badge,
  onRefresh,
  refreshing,
  embedded,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
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
          <div className="flex flex-col items-end gap-2">
            {badge && (
              <Badge
                variant={badge === ar.statusOpen ? "success" : "muted"}
                className="text-[10px]"
              >
                {badge}
              </Badge>
            )}
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
        </div>
      </motion.header>
      {children}
    </div>
  );
}
