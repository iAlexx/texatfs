"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Loader2,
  MessageCircle,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import { useTexasSubAgents } from "@/hooks/use-texas-agents-api";
import {
  useRegisterWhatsAppPhone,
  useWhatsAppOnboardingStatus,
  type RegisterPhoneResult,
} from "@/hooks/use-whatsapp-onboarding-api";
import { canManageNetwork } from "@/lib/hierarchy/subtree-rules";
import { COUNTRY_DIAL_CODES } from "@/lib/whatsapp/country-codes";
import { WHATSAPP_USER_INIT_INSTRUCTION_AR } from "@/lib/whatsapp/onboarding-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GradientIcon,
  PremiumCard,
  SectionHeader,
  StatusPill,
} from "@/components/ui/premium";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils/cn";

const COUNTRY_OPTIONS = COUNTRY_DIAL_CODES.map((c) => ({
  code: c.code,
  label: `+${c.code} ${c.labelAr}`,
}));

function activationTone(status: string | undefined) {
  if (status === "VERIFIED_COMPLETED") return "success" as const;
  if (status === "PENDING_EMOJI") return "warning" as const;
  return "neutral" as const;
}

function activationLabel(status: string | undefined) {
  if (status === "VERIFIED_COMPLETED") return ar.waStatusActive;
  if (status === "PENDING_EMOJI") return ar.waStatusPending;
  return ar.waStatusInactive;
}

export function WhatsAppCenter() {
  const { telegramUserId, isReady, canAuthenticate } = useTelegram();
  const ledgerDate = todayIsoDate();
  const session = useLedgerSession(ledgerDate);
  const statusQuery = useWhatsAppOnboardingStatus(telegramUserId);
  const register = useRegisterWhatsAppPhone();

  const showAgents = session.data?.user
    ? canManageNetwork(session.data.user.role)
    : false;

  const [forceRefresh, setForceRefresh] = useState(false);
  const subAgents = useTexasSubAgents(
    ledgerDate,
    isReady && canAuthenticate && showAgents,
    forceRefresh
  );

  const [countryCode, setCountryCode] = useState("963");
  const [localPhone, setLocalPhone] = useState("");
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [lastRegister, setLastRegister] = useState<RegisterPhoneResult | null>(
    null
  );

  const onboarding = statusQuery.data?.onboardingStatus ?? "PENDING_REGISTRATION";
  const botConfig = statusQuery.data ?? lastRegister;
  const activationUrl = botConfig?.whatsappActivationUrl;
  const instructionText =
    botConfig?.instructionText ?? WHATSAPP_USER_INIT_INSTRUCTION_AR;

  const agents = subAgents.data?.agents ?? [];
  const missingGroups = useMemo(
    () => agents.filter((a) => !a.whatsapp?.group_exists).length,
    [agents]
  );
  const totalGroups = statusQuery.data?.groupCount ?? 0;

  const showForm =
    onboarding === "PENDING_REGISTRATION" ||
    onboarding === "PENDING_EMOJI" ||
    changePhoneOpen;

  function handleRefreshGroups() {
    setForceRefresh(true);
    void subAgents.refetch().finally(() => setForceRefresh(false));
    toast.success(ar.waGroupsRefreshStarted);
  }

  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      <motion.section
        className="fintech-hero relative overflow-hidden rounded-3xl p-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative z-10 flex items-start gap-3">
          <GradientIcon icon={MessageCircle} variant="green" />
          <div>
            <h1 className="text-xl font-bold text-white">{ar.waPageTitle}</h1>
            <p className="mt-1 text-sm text-steel-400">{ar.waPageSubtitle}</p>
          </div>
        </div>
      </motion.section>

      <PremiumCard glow="green">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-steel-500">{ar.waActivationStatus}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {activationLabel(onboarding)}
            </p>
          </div>
          {statusQuery.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-steel-500" />
          ) : (
            <StatusPill
              label={activationLabel(onboarding)}
              tone={activationTone(onboarding)}
            />
          )}
        </div>
      </PremiumCard>

      {botConfig?.botWhatsappNumber ? (
        <PremiumCard glow="blue">
          <p className="text-xs text-steel-500">{ar.waBotNumber}</p>
          <p dir="ltr" className="mt-2 font-mono text-lg font-semibold text-white">
            +{botConfig.botWhatsappNumber}
          </p>
          {activationUrl ? (
            <Button
              type="button"
              className="mt-4 w-full fintech-btn-primary"
              asChild
            >
              <a href={activationUrl} target="_blank" rel="noopener noreferrer">
                {ar.waOpenWhatsapp}
              </a>
            </Button>
          ) : null}
        </PremiumCard>
      ) : null}

      <PremiumCard>
        <div className="flex items-start gap-3">
          <GradientIcon icon={Shield} variant="purple" />
          <div>
            <p className="text-sm font-semibold text-white">{ar.waInstructionsTitle}</p>
            <p className="mt-2 text-xs leading-relaxed text-steel-400">
              {ar.waInstructionsBody}
            </p>
            {onboarding === "PENDING_EMOJI" ? (
              <p className="mt-3 whitespace-pre-line text-xs text-amber-300/90">
                {instructionText}
              </p>
            ) : null}
          </div>
        </div>
      </PremiumCard>

      {onboarding === "VERIFIED_COMPLETED" && !changePhoneOpen ? (
        <PremiumCard glow="green">
          <p className="text-sm font-semibold text-emerald-400">{ar.waVerifiedTitle}</p>
          {statusQuery.data?.whatsappPhone ? (
            <p dir="ltr" className="mt-2 font-mono text-sm text-steel-300">
              +{statusQuery.data.whatsappPhone}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full border-emerald-500/30 text-emerald-300"
            onClick={() => setChangePhoneOpen(true)}
          >
            {ar.waChangeNumber}
          </Button>
        </PremiumCard>
      ) : null}

      <PremiumCard glow="purple">
        <div className="flex items-center gap-3">
          <GradientIcon icon={Users} variant="purple" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{ar.waGroupsTitle}</p>
            <p className="mt-1 text-xs text-steel-400">
              {totalGroups} {ar.waGroupsTotal}
              {showAgents && agents.length > 0
                ? ` · ${missingGroups} ${ar.waGroupsMissing}`
                : ""}
            </p>
          </div>
        </div>
        {showAgents ? (
          <Button
            type="button"
            className="mt-4 w-full fintech-btn-primary"
            disabled={subAgents.isFetching || forceRefresh}
            onClick={handleRefreshGroups}
          >
            {subAgents.isFetching || forceRefresh ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {ar.loading}
              </>
            ) : missingGroups > 0 ? (
              ar.waCreateMissingGroups
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {ar.waRefreshGroups}
              </>
            )}
          </Button>
        ) : null}
      </PremiumCard>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
        {ar.waAntiBanNote}
      </div>

      {showForm ? (
        <PremiumCard>
          <p className="mb-3 text-sm font-semibold text-white">{ar.waRegisterTitle}</p>
          <label className="block text-[11px] text-steel-500">{ar.waPhoneLabel}</label>
          <div className="mt-2 flex gap-2" dir="ltr">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              disabled={register.isPending || onboarding === "PENDING_EMOJI"}
              className="h-11 min-w-[7rem] rounded-xl border border-white/10 bg-[#141824] px-2 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500/40"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="9xx xxx xxxx"
              value={localPhone}
              onChange={(e) =>
                setLocalPhone(e.target.value.replace(/[^\d\s]/g, ""))
              }
              disabled={register.isPending || onboarding === "PENDING_EMOJI"}
              className="h-11 flex-1 border-white/10 bg-[#141824] font-mono text-sm"
            />
          </div>
          <Button
            className="mt-3 w-full fintech-btn-primary"
            disabled={
              register.isPending ||
              !localPhone.trim() ||
              onboarding === "PENDING_EMOJI"
            }
            onClick={() => {
              register.mutate(
                { phone: localPhone.trim(), countryCode },
                {
                  onSuccess: (data) => {
                    setLastRegister(data);
                    setChangePhoneOpen(false);
                    toast.success(ar.waRegisterSuccess);
                  },
                  onError: (e) => toast.error(e.message),
                }
              );
            }}
          >
            {register.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {ar.loading}
              </>
            ) : (
              ar.waRegisterSubmit
            )}
          </Button>
        </PremiumCard>
      ) : null}

      <button
        type="button"
        className="flex w-full min-h-[44px] items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0B0B0F]/80 px-4 py-3 text-sm text-steel-400"
        onClick={() => setTechOpen((v) => !v)}
      >
        {ar.waTechDetails}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", techOpen && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {techOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <PremiumCard className="text-[10px] text-steel-500">
              <p>status: {onboarding}</p>
              <p>groups: {totalGroups}</p>
              {!botConfig?.botNumberConfigured ? (
                <p className="text-rose-400">{ar.waBotNotConfigured}</p>
              ) : null}
            </PremiumCard>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
