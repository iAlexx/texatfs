"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Megaphone,
  MessageCircle,
  RefreshCw,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData } from "@/hooks/use-tma-api";
import { useTexasSubAgents } from "@/hooks/use-texas-agents-api";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import { useWhatsAppOnboardingStatus } from "@/hooks/use-whatsapp-onboarding-api";
import { canManageNetwork } from "@/lib/hierarchy/subtree-rules";
import {
  GradientIcon,
  PremiumCard,
  SectionHeader,
  StatusPill,
} from "@/components/ui/premium";
import { ar } from "@/lib/i18n/ar";

export function PremiumHomePage() {
  const { displayName, telegramUserId, canAuthenticate } = useTelegram();
  const hero = useHeroData();
  const session = useLedgerSession(todayIsoDate());
  const wa = useWhatsAppOnboardingStatus(telegramUserId);

  const showAgents = session.data?.user
    ? canManageNetwork(session.data.user.role)
    : false;

  const subAgents = useTexasSubAgents(
    todayIsoDate(),
    Boolean(canAuthenticate && showAgents),
    false
  );

  const name = hero.data?.user.display_name ?? displayName ?? "ماستر";
  const agentCount = subAgents.data?.agents?.length ?? 0;
  const waVerified = wa.data?.onboardingStatus === "VERIFIED_COMPLETED";

  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      <motion.section
        className="fintech-hero relative overflow-hidden rounded-3xl p-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 -right-8 h-36 w-36 rounded-full bg-pink-500/15 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-2xl" />

        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-blue-400/90">
              {ar.brandEn}
            </span>
          </div>
          <h1 className="text-2xl font-bold leading-tight text-white">
            {ar.homeHeroTitle}
          </h1>
          <p className="mt-2 text-sm text-steel-300">{ar.homeHeroSubtitle}</p>
          <p className="mt-4 text-base text-white/90">
            {ar.homeWelcome}، <span className="font-semibold">{name}</span>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill
              label={
                hero.data?.user.subscription_active
                  ? ar.statusActive
                  : ar.statusExpired
              }
              tone={hero.data?.user.subscription_active ? "success" : "danger"}
            />
            <StatusPill
              label={waVerified ? ar.statusVerified : ar.statusNotVerified}
              tone={waVerified ? "success" : "warning"}
            />
            {showAgents ? (
              <StatusPill
                label={`${agentCount} ${ar.activeAgents}`}
                tone="info"
              />
            ) : null}
          </div>

          {hero.data?.announcement ? (
            <p className="mt-4 rounded-2xl border border-violet-500/20 bg-black/30 px-3 py-2.5 text-xs leading-relaxed text-steel-300">
              {hero.data.announcement}
            </p>
          ) : null}
        </div>
      </motion.section>

      <section>
        <SectionHeader title={ar.homeQuickActions} />
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            href="/ledger"
            icon={Users}
            label={ar.navAgents}
            desc={ar.homeAgentsDesc}
            variant="purple"
          />
          <QuickAction
            href="/whatsapp"
            icon={MessageCircle}
            label={ar.navWhatsapp}
            desc={ar.homeWhatsappDesc}
            variant="green"
          />
          <QuickAction
            href="/profile"
            icon={User}
            label={ar.navProfile}
            desc={ar.homeProfileDesc}
            variant="blue"
          />
          <QuickAction
            href="/ledger"
            icon={RefreshCw}
            label={ar.refresh}
            desc={ar.homeRefreshDesc}
            variant="pink"
            onClick={() => void subAgents.refetch()}
          />
        </div>
      </section>

      <section>
        <SectionHeader title={ar.homeStatusTitle} />
        <div className="grid grid-cols-2 gap-2.5">
          <StatusMini
            label={ar.homeStatusSubscription}
            value={
              hero.data?.user.subscription_active ? ar.statusActive : ar.statusExpired
            }
            tone={hero.data?.user.subscription_active ? "success" : "danger"}
          />
          <StatusMini
            label={ar.homeStatusWhatsapp}
            value={waVerified ? ar.statusVerified : ar.statusNotVerified}
            tone={waVerified ? "success" : "warning"}
          />
          <StatusMini
            label={ar.homeStatusSync}
            value={hero.data?.synced_today ? ar.statusSynced : ar.statusPending}
            tone={hero.data?.synced_today ? "success" : "info"}
          />
          <StatusMini
            label={ar.homeStatusChannel}
            value={ar.homeChannelMember}
            tone="info"
          />
        </div>
      </section>

      <PremiumCard glow="purple" className="flex items-center gap-3">
        <GradientIcon icon={Megaphone} variant="pink" />
        <div>
          <p className="text-sm font-semibold text-white">{ar.homeChannelTitle}</p>
          <p className="text-xs text-steel-400">@Texas0NEWS</p>
        </div>
      </PremiumCard>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  desc,
  variant,
  onClick,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  desc: string;
  variant: "blue" | "purple" | "pink" | "green";
  onClick?: () => void;
}) {
  const inner = (
    <>
      <GradientIcon icon={Icon} variant={variant} />
      <div className="mt-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-[10px] text-steel-500">{desc}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <PremiumCard glow="blue" onClick={onClick} className="text-right">
        {inner}
      </PremiumCard>
    );
  }

  return (
    <Link href={href} className="block">
      <PremiumCard glow="blue" className="h-full text-right">
        {inner}
      </PremiumCard>
    </Link>
  );
}

function StatusMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="fintech-glass rounded-2xl border border-white/[0.06] p-3">
      <p className="text-[10px] text-steel-500">{label}</p>
      <div className="mt-2">
        <StatusPill label={value} tone={tone} />
      </div>
    </div>
  );
}
