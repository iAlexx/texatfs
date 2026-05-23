"use client";

import { useMemo, useState } from "react";
import {
  Gift,
  KeyRound,
  MessageCircle,
  Shield,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData, useRedeemLicense, useReferralData } from "@/hooks/use-tma-api";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { ar } from "@/lib/i18n/ar";

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
    colors: ["#D4AF37", "#B8FF3C", "#ffffff"],
  });
}

export function ProfilePage() {
  const { displayName } = useTelegram();
  const hero     = useHeroData();
  const referral = useReferralData();
  const session  = useLedgerSession(todayIsoDate());
  const redeem   = useRedeemLicense();
  const [licenseKey, setLicenseKey] = useState("");

  const user     = hero.data?.user ?? session.data?.user;
  const endDate  = user?.subscription_end_date;
  const percent  = useMemo(() => subscriptionPercent(endDate), [endDate]);
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
      toast.success("تم تفعيل المفتاح بنجاح");
      setLicenseKey("");
      void hero.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التفعيل");
    }
  }

  return (
    <div className="px-4 pt-6">
      <header className="mb-6">
        <p className="text-xs text-gold/70">{ar.brandEn}</p>
        <h1 className="text-2xl font-bold text-foreground">{ar.profileTitle}</h1>
      </header>

      {/* ── Profile card ─────────────────────────────────────────────────────── */}
      <section className="glass-panel-gold mb-4 p-5">
        <div className="flex items-center gap-4">
          <CircularProgress
            percent={percent}
            label="متبقي"
            sublabel={daysLeft ? `${daysLeft} يوم` : "منتهي"}
          />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/15 ring-1 ring-gold/30">
                <User className="h-5 w-5 text-gold" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-semibold">{user?.display_name ?? displayName}</p>
                <p className="text-xs text-steel-500">{user?.texas_username}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-lime/15 px-3 py-1 text-xs text-lime ring-1 ring-lime/30">
                <Shield className="mr-1 inline h-3 w-3" />
                {user ? roleLabel(user.role) : "—"}
              </span>
              <span
                className={
                  user?.subscription_active
                    ? "rounded-full bg-lime/10 px-3 py-1 text-xs text-lime ring-1 ring-lime/25"
                    : "rounded-full bg-destructive/10 px-3 py-1 text-xs text-accent-negative ring-1 ring-destructive/30"
                }
              >
                {user?.subscription_active ? "اشتراك فعّال" : "اشتراك منتهي"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Referral ─────────────────────────────────────────────────────────── */}
      <section className="glass-inner mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Gift className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <h2 className="font-semibold">{ar.referralTitle}</h2>
        </div>
        <p className="mb-2 font-mono text-sm text-gold">
          {referral.data?.referral_code ?? "—"}
        </p>
        <div className="flex gap-4 text-xs text-steel-500">
          <span>
            <Users className="mr-1 inline h-3 w-3" />
            {ar.referralInvited}: {referral.data?.invited_count ?? 0}
          </span>
          <span>
            {ar.referralReward}: {referral.data?.reward_days ?? 0} يوم
          </span>
        </div>
      </section>

      {/* ── License redeem ───────────────────────────────────────────────────── */}
      <section className="glass-panel-gold p-5">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <h2 className="font-semibold">{ar.redeemLicense}</h2>
        </div>
        <p className="mb-4 text-xs text-steel-500">{ar.redeemHint}</p>
        <Input
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
          placeholder="TEXAS-XXXX-XXXX-XXXX"
          className="mb-3 border-steel-border bg-obsidian/50 font-mono text-sm"
        />
        <Button
          variant="gold"
          className="w-full"
          disabled={redeem.isPending || !licenseKey.trim()}
          onClick={() => void handleRedeem()}
        >
          {redeem.isPending ? ar.loading : ar.redeemSubmit}
        </Button>
      </section>

      {/* ── WhatsApp Tracking System ──────────────────────────────────────── */}
      <WhatsAppTrackingInfo />
    </div>
  );
}

/* ── WhatsAppTrackingInfo ──────────────────────────────────────────────────── */
/**
 * Centralised WhatsApp tracking system info card.
 * No interactive setup — sub-agent ↔ group mappings are administered server-side.
 */
function WhatsAppTrackingInfo() {
  const supportNumber = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER ?? "";
  const supportLink = supportNumber
    ? `https://wa.me/${supportNumber.replace(/[^\d]/g, "")}`
    : null;

  return (
    <motion.section
      className="mt-4 overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#0a1410]/80 backdrop-blur-md"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <MessageCircle className="h-5 w-5 text-emerald-400" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-semibold text-foreground">نظام التتبع عبر واتساب</p>
            <p className="text-[10px] text-steel-500">Texas Funds · WhatsApp Tracking</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          متصل
        </span>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="rounded-xl bg-obsidian/40 px-4 py-3 ring-1 ring-white/[0.04] text-[11px] text-steel-400 leading-relaxed space-y-2">
          <p className="font-semibold text-steel-300 mb-1">كيف يعمل النظام:</p>
          <p>
            📱 يتم ربط كل وكيل فرعي بمجموعة واتساب مخصصة، تتم إدارة الربط مركزياً
            من قِبل فريق الدعم.
          </p>
          <p>
            ✅ اكتب <strong className="text-emerald-400">✅90000</strong> في مجموعة الوكيل لتسجيل
            مبلغ <em>واصل منك</em>
          </p>
          <p>
            🛑 اكتب <strong className="text-rose-400">🛑45000</strong> في مجموعة الوكيل لتسجيل
            مبلغ <em>واصل الك</em>
          </p>
          <p>
            ثم رُد على رسالة تأكيد البوت بكتابة{" "}
            <strong className="text-emerald-400">1</strong> للتأكيد أو{" "}
            <strong className="text-rose-400">2</strong> للإلغاء.
          </p>
        </div>

        {supportLink && (
          <a
            href={supportLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            التواصل مع الدعم لربط مجموعة جديدة
          </a>
        )}
      </div>
    </motion.section>
  );
}
