"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, RefreshCw } from "lucide-react";
import { SubAgentsDashboard } from "@/components/ledger/SubAgentsDashboard";
import { SubscriptionExpiredOverlay } from "@/components/ledger/SubscriptionExpiredOverlay";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import { useTexasSubAgents } from "@/hooks/use-texas-agents-api";
import { canManageNetwork } from "@/lib/hierarchy/subtree-rules";
import { ar } from "@/lib/i18n/ar";

export function DailyLedgerView({ embedded = false }: { embedded?: boolean }) {
  const [forceRefreshSubAgents, setForceRefreshSubAgents] = useState(false);
  const telegram = useTelegram();
  const ledgerDate = todayIsoDate();

  const session = useLedgerSession(ledgerDate, null, {
    forceSync: false,
    viewMode: "monthly",
  });

  const showAgents = session.data?.user
    ? canManageNetwork(session.data.user.role)
    : false;

  const subAgentsQuery = useTexasSubAgents(
    ledgerDate,
    telegram.isReady && telegram.canAuthenticate && showAgents,
    forceRefreshSubAgents
  );

  function handleRefresh() {
    setForceRefreshSubAgents(true);
    void subAgentsQuery.refetch().finally(() => setForceRefreshSubAgents(false));
  }

  if (!telegram.isReady) {
    return (
      <Shell embedded={embedded}>
        <motion.div
          className="flex items-center justify-center gap-2 py-20 text-steel-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          <span className="text-sm">{ar.loading}</span>
        </motion.div>
      </Shell>
    );
  }

  if (!telegram.canAuthenticate) {
    return (
      <Shell embedded={embedded}>
        <p className="text-accent-negative">
          {telegram.authError ?? ar.errorGeneric}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" />
          {ar.retry}
        </Button>
      </Shell>
    );
  }

  if (session.isLoading && !session.data) {
    return (
      <Shell embedded={embedded}>
        <div className="flex flex-col items-center py-20 text-steel-500">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
          <p className="mt-3 text-sm">{ar.loadingSubAgents}</p>
        </div>
      </Shell>
    );
  }

  if (session.subscriptionExpired && session.data?.user) {
    return (
      <>
        <Shell embedded={embedded}>
          <p className="text-steel-500">{ar.accessSuspended}</p>
        </Shell>
        <SubscriptionExpiredOverlay
          subscriptionEndDate={session.data.user.subscription_end_date}
        />
      </>
    );
  }

  if (session.error) {
    return (
      <Shell embedded={embedded}>
        <p className="text-accent-negative">{session.error}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void session.refresh()}>
          {ar.retry}
        </Button>
      </Shell>
    );
  }

  if (!showAgents) {
    return (
      <Shell embedded={embedded}>
        <div className="rounded-2xl border border-white/[0.06] px-4 py-14 text-center text-sm text-steel-400">
          {ar.noSubAgents}
        </div>
      </Shell>
    );
  }

  return (
    <Shell embedded={embedded}>
      <SubAgentsDashboard
        data={subAgentsQuery.data}
        isLoading={subAgentsQuery.isLoading}
        error={subAgentsQuery.error}
        onRetry={() => void subAgentsQuery.refetch()}
        onRefresh={handleRefresh}
        refreshing={subAgentsQuery.isFetching}
      />
    </Shell>
  );
}

function Shell({
  embedded,
  children,
}: {
  embedded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={embedded ? "px-4 pb-4 pt-2" : "px-4 pb-6 pt-4"}>
      {children}
    </div>
  );
}
