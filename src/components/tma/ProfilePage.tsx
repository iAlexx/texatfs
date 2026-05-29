"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ExternalLink,
  KeyRound,
  Loader2,
  MessageCircle,
  Shield,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData, useRedeemLicense } from "@/hooks/use-tma-api";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import {
  useWhatsAppOnboardingStatus,
} from "@/hooks/use-whatsapp-onboarding-api";
import { useRepairTexasCredentials } from "@/hooks/use-texas-repair-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CircularProgress } from "@/components/ui/CircularProgress";
import {
  GradientIcon,
  PremiumCard,
  SectionHeader,
  StatusPill,
} from "@/components/ui/premium";
import { ar } from "@/lib/i18n/ar";

const CHANNEL_URL = "https://t.me/Texas0NEWS";

function roleLabel(role: string): string {
  if (role === "master") return ar.roleMaster;
  if (role === "player") return ar.rolePlayer;
  return ar.roleSuperMaster;
}

function subscriptionPercent(endDate: string | null | undefined): number {
  if (!endDate) return 0;
  const end = new Date(endDate);
  const daysLeft = Math.ceil(
    (end.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (daysLeft <= 0) return 0;
  return Math.min(100, (daysLeft / 30) * 100);
}

async function fireConfetti() {
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: 120,
    spread: 70,
    origin: { y: 0.65 },
    colors: ["#3B82F6", "#8B5CF6", "#EC4899"],
  });
}

export function ProfilePage() {
  const { displayName, telegramUserId } = useTelegram();
  const hero = useHeroData();
  const session = useLedgerSession(todayIsoDate());
  const redeem = useRedeemLicense();
  const wa = useWhatsAppOnboardingStatus(telegramUserId);
  const [licenseKey, setLicenseKey] = useState("");

  const user = hero.data?.user ?? session.data?.user;
  const endDate = user?.subscription_end_date;
  const percent = useMemo(() => subscriptionPercent(endDate), [endDate]);
  const daysLeft = useMemo(() => {
    if (!endDate) return 0;
    return Math.max(
      0,
      Math.ceil(
        (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    );
  }, [endDate]);

  async function handleRedeem() {
    if (!licenseKey.trim()) return;
    try {
      await redeem.mutateAsync(licenseKey.trim());
      await fireConfetti();
      toast.success(ar.redeemSuccess);
      setLicenseKey("");
      void hero.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ar.errorGeneric);
    }
  }

  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      <SectionHeader title={ar.profileTitle} subtitle={ar.profileSubtitle} />

      <PremiumCard glow="purple">
        <div className="flex items-center gap-4">
          <CircularProgress
            percent={percent}
            label={ar.profileDaysLeft}
            sublabel={daysLeft ? `${daysLeft} يوم` : ar.statusExpired}
          />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <GradientIcon icon={User} variant="purple" />
              <div>
                <p className="font-semibold text-white">
                  {user?.display_name ?? displayName}
                </p>
                <p className="text-xs text-steel-500">{user?.texas_username}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill label={user ? roleLabel(user.role) : "—"} tone="info" />
              <StatusPill
                label={
                  user?.subscription_active ? ar.statusActive : ar.statusExpired
                }
                tone={user?.subscription_active ? "success" : "danger"}
              />
            </div>
            {endDate ? (
              <p className="mt-2 text-[10px] text-steel-500">
                {ar.profileSubscriptionUntil}:{" "}
                {new Date(endDate).toLocaleDateString("ar-SY")}
              </p>
            ) : null}
          </div>
        </div>
      </PremiumCard>

      <PremiumCard>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GradientIcon icon={MessageCircle} variant="green" />
            <div>
              <p className="text-sm font-semibold text-white">{ar.profileWhatsappLink}</p>
              <p className="text-xs text-steel-500">
                {wa.data?.onboardingStatus === "VERIFIED_COMPLETED"
                  ? ar.statusVerified
                  : ar.statusNotVerified}
              </p>
            </div>
          </div>
          <Link
            href="/whatsapp"
            className="rounded-xl fintech-btn-primary px-3 py-2 text-xs font-semibold"
          >
            {ar.profileManageWhatsapp}
          </Link>
        </div>
      </PremiumCard>

      <PremiumCard glow="blue">
        <div className="flex items-center gap-3">
          <GradientIcon icon={Shield} variant="blue" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{ar.homeChannelTitle}</p>
            <p className="text-xs text-steel-500">@Texas0NEWS</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-violet-500/30 text-violet-300"
            onClick={() => window.open(CHANNEL_URL, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {ar.channelSubscribe}
          </Button>
        </div>
      </PremiumCard>

      <TexasCredentialsRepair telegramUserId={telegramUserId} />

      <PremiumCard glow="pink">
        <div className="mb-4 flex items-center gap-2">
          <GradientIcon icon={KeyRound} variant="pink" />
          <h2 className="font-semibold text-white">{ar.redeemLicense}</h2>
        </div>
        <p className="mb-4 text-xs text-steel-500">{ar.redeemHint}</p>
        <Input
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
          placeholder="TEXAS-XXXX-XXXX-XXXX"
          className="mb-3 border-white/10 bg-[#141824] font-mono text-sm"
        />
        <Button
          className="w-full fintech-btn-primary"
          disabled={redeem.isPending || !licenseKey.trim()}
          onClick={() => void handleRedeem()}
        >
          {redeem.isPending ? ar.loading : ar.redeemSubmit}
        </Button>
      </PremiumCard>

      <p className="text-center text-[10px] text-steel-600">
        {ar.profileVersion} · v0.1.0
      </p>
    </div>
  );
}

function TexasCredentialsRepair({
  telegramUserId,
}: {
  telegramUserId: number | null | undefined;
}) {
  const statusQuery = useWhatsAppOnboardingStatus(telegramUserId);
  const session = useLedgerSession(todayIsoDate());
  const repair = useRepairTexasCredentials();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);

  const missingStored =
    statusQuery.isSuccess && statusQuery.data?.hasTexasCredentials === false;
  const ledgerBlocked =
    Boolean(session.data?.user) &&
    typeof session.error === "string" &&
    session.error.includes("بيانات دخول تكساس");
  const needsRepair = missingStored || ledgerBlocked;

  if (!needsRepair && !open) {
    return (
      <PremiumCard>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-white/10 text-steel-400 text-[11px]"
          onClick={() => setOpen(true)}
        >
          {ar.profileTexasRepair}
        </Button>
      </PremiumCard>
    );
  }

  return (
    <motion.section
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <p className="mb-2 text-sm font-semibold text-amber-400">
        {ar.profileTexasRepair}
      </p>
      <p className="mb-3 text-[11px] text-steel-400 leading-relaxed">
        {ar.profileTexasRepairHint}
      </p>
      <Input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        placeholder="اسم المستخدم / البريد"
        className="mb-2 border-white/10 bg-[#141824] text-sm"
        autoComplete="username"
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="كلمة مرور تكساس"
        className="mb-3 border-white/10 bg-[#141824] text-sm"
        autoComplete="current-password"
      />
      <Button
        className="w-full fintech-btn-primary"
        disabled={repair.isPending || !login.trim() || password.length < 4}
        onClick={() => {
          repair.mutate(
            { texasLogin: login.trim(), texasPassword: password },
            {
              onSuccess: (data) => {
                toast.success(data.message ?? ar.profileTexasRepairDone);
                setOpen(false);
                session.refresh();
              },
              onError: (e) => toast.error(e.message),
            }
          );
        }}
      >
        {repair.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          ar.profileTexasRepairSave
        )}
      </Button>
    </motion.section>
  );
}
