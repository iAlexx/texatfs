"use client";

import { useMemo, useState } from "react";
import {
  Gift,
  KeyRound,
  Loader2,
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
import {
  useWhatsAppOnboardingStatus,
  useRegisterWhatsAppPhone,
  type RegisterPhoneResult,
} from "@/hooks/use-whatsapp-onboarding-api";
import { useRepairTexasCredentials } from "@/hooks/use-texas-repair-api";
import { COUNTRY_DIAL_CODES } from "@/lib/whatsapp/country-codes";
import { WHATSAPP_USER_INIT_INSTRUCTION_AR } from "@/lib/whatsapp/onboarding-copy";
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
  const { displayName, telegramUserId } = useTelegram();
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

      {/* ── Texas credentials repair ───────────────── */}
      <TexasCredentialsRepair telegramUserId={telegramUserId} />

      {/* ── WhatsApp Tracking System ──────────────────────────────────────── */}
      <WhatsAppTrackingInfo telegramUserId={telegramUserId} />
    </div>
  );
}

/* ── WhatsAppTrackingInfo ──────────────────────────────────────────────────── */

const COUNTRY_OPTIONS = COUNTRY_DIAL_CODES.map((c) => ({
  code: c.code,
  label: `+${c.code} ${c.labelAr}`,
}));

function onboardingBadge(status: string | undefined) {
  if (status === "VERIFIED_COMPLETED") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        مفعّل
      </span>
    );
  }
  if (status === "PENDING_EMOJI") {
    return (
      <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
        بانتظار التحقق
      </span>
    );
  }
  return (
    <span className="rounded-full bg-steel-800/60 px-3 py-1 text-[10px] text-steel-500 ring-1 ring-white/[0.06]">
      غير مفعّل
    </span>
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
      <section className="mt-4 glass-inner p-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-steel-border text-steel-400 text-[11px]"
          onClick={() => setOpen(true)}
        >
          إعادة ربط حساب تكساس
        </Button>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <p className="mb-2 text-sm font-semibold text-amber-400">
        إعادة ربط حساب تكساس
      </p>
      <p className="mb-3 text-[11px] text-steel-400 leading-relaxed">
        لوحة المحاسبة تحتاج بيانات دخول تكساس مخزّنة. أدخل نفس اسم المستخدم وكلمة
        المرور من لوحة تكساس.
      </p>
      <Input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        placeholder="اسم المستخدم / البريد"
        className="mb-2 border-steel-border bg-obsidian/60 text-sm"
        autoComplete="username"
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="كلمة مرور تكساس"
        className="mb-3 border-steel-border bg-obsidian/60 text-sm"
        autoComplete="current-password"
      />
      <Button
        variant="gold"
        className="w-full"
        disabled={repair.isPending || !login.trim() || password.length < 4}
        onClick={() => {
          repair.mutate(
            { texasLogin: login.trim(), texasPassword: password },
            {
              onSuccess: (data) => {
                toast.success(data.message ?? "تم ربط حساب تكساس");
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
          "حفظ بيانات تكساس"
        )}
      </Button>
    </section>
  );
}

function WhatsAppTrackingInfo({
  telegramUserId,
}: {
  telegramUserId: number | null | undefined;
}) {
  const statusQuery = useWhatsAppOnboardingStatus(telegramUserId);
  const register = useRegisterWhatsAppPhone();
  const [countryCode, setCountryCode] = useState("963");
  const [localPhone, setLocalPhone] = useState("");
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [lastRegister, setLastRegister] = useState<RegisterPhoneResult | null>(
    null
  );

  const onboarding = statusQuery.data?.onboardingStatus ?? "PENDING_REGISTRATION";
  const botConfig = statusQuery.data ?? lastRegister;
  const activationUrl = botConfig?.whatsappActivationUrl;
  const instructionText =
    botConfig?.instructionText ?? WHATSAPP_USER_INIT_INSTRUCTION_AR;
  const showForm =
    onboarding === "PENDING_REGISTRATION" ||
    onboarding === "PENDING_EMOJI" ||
    changePhoneOpen;

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
            <p className="text-[10px] text-steel-500">Texas Funds · مركزي</p>
          </div>
        </div>
        {statusQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-steel-500" />
        ) : (
          onboardingBadge(onboarding)
        )}
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="rounded-xl bg-obsidian/40 px-4 py-3 ring-1 ring-white/[0.04] text-[11px] text-steel-400 leading-relaxed space-y-2">
          <p className="font-semibold text-steel-300 mb-1">كيف يعمل النظام:</p>
          <p>
            📱 سجّل رقمك، ثم <strong className="text-amber-400">أنت</strong> ترسل أول
            رسالة إلى البوت (😎 أو «تفعيل») — البوت لا يرسل رسالة أولى لتجنب الحظر.
          </p>
          <p>
            ✅ في مجموعة كل وكيل: <strong className="text-emerald-400">✅90000</strong>{" "}
            (واصل منك) — رُد <strong className="text-emerald-400">1</strong> للتأكيد أو{" "}
            <strong className="text-steel-400">2</strong> للإلغاء
          </p>
          <p>
            🛑 في مجموعة كل وكيل: <strong className="text-rose-400">🛑45000</strong>{" "}
            (واصل الك) — رُد <strong className="text-rose-400">1</strong> للتأكيد أو{" "}
            <strong className="text-steel-400">2</strong> للإلغاء
          </p>
        </div>

        {onboarding === "VERIFIED_COMPLETED" && !changePhoneOpen && (
          <div className="rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/25 text-[11px] text-emerald-300/90 space-y-1">
            <p className="font-semibold text-emerald-400">✅ الحساب مفعّل بالكامل</p>
            {statusQuery.data?.whatsappPhone && (
              <p dir="ltr" className="font-mono text-steel-400">
                +{statusQuery.data.whatsappPhone}
              </p>
            )}
            <p>
              مجموعات التتبع:{" "}
              <strong className="text-emerald-400">
                {statusQuery.data?.groupCount ?? 0}
              </strong>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full border-emerald-500/30 text-emerald-300"
              onClick={() => setChangePhoneOpen(true)}
            >
              تغيير رقم الواتساب
            </Button>
          </div>
        )}

        {onboarding === "PENDING_EMOJI" && (
          <div className="rounded-xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/25 text-[11px] text-amber-200/90 leading-relaxed space-y-2">
            <p className="font-semibold text-amber-400">📩 أكمل التفعيل من واتساب</p>
            <p className="whitespace-pre-line">{instructionText}</p>
            {botConfig?.botWhatsappNumber && (
              <p dir="ltr" className="font-mono text-steel-400">
                رقم البوت: +{botConfig.botWhatsappNumber}
              </p>
            )}
            {!botConfig?.botNumberConfigured && (
              <p className="text-rose-400/90">
                تحذير: رقم البوت غير مضبوط في الخادم (WHATSAPP_BOT_NUMBER).
              </p>
            )}
            {activationUrl ? (
              <Button
                type="button"
                variant="gold"
                size="sm"
                className="mt-2 w-full"
                asChild
              >
                <a href={activationUrl} target="_blank" rel="noopener noreferrer">
                  فتح واتساب للتفعيل
                </a>
              </Button>
            ) : null}
          </div>
        )}

        {showForm && (
          <div className="space-y-3">
            <label className="block text-[11px] font-medium text-steel-400">
              رقم واتساب (مع رمز الدولة)
            </label>
            <div className="flex gap-2" dir="ltr">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                disabled={register.isPending || onboarding === "PENDING_EMOJI"}
                className="h-11 min-w-[7rem] rounded-xl border border-steel-border bg-obsidian/60 px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-emerald-500/40"
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
                className="h-11 flex-1 border-steel-border bg-obsidian/60 font-mono text-sm"
              />
            </div>

            <Button
              variant="gold"
              className="w-full gap-2"
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
                      toast.success("تم حفظ رقمك. افتح واتساب وأرسل 😎 إلى البوت.");
                    },
                    onError: (e) => {
                      toast.error(e.message);
                    },
                  }
                );
              }}
            >
              {register.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري المزامنة…
                </>
              ) : (
                "تفعيل ومزامنة الحساب"
              )}
            </Button>
          </div>
        )}
      </div>
    </motion.section>
  );
}
