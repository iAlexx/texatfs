"use client";

import { useMemo, useState, useEffect } from "react";
import { Gift, KeyRound, MessageCircle, Shield, User, Users, Wifi, WifiOff, Loader2, CheckCircle2, Flame } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData, useRedeemLicense, useReferralData } from "@/hooks/use-tma-api";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import {
  useWhatsAppStatus,
  useWhatsAppConnect,
  useWhatsAppDisconnect,
  useWhatsAppStatusPoller,
  useWhatsAppHealth,
} from "@/hooks/use-whatsapp-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils/cn";

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
  const hero = useHeroData();
  const referral = useReferralData();
  const session = useLedgerSession(todayIsoDate());
  const redeem = useRedeemLicense();
  const [licenseKey, setLicenseKey] = useState("");

  // WhatsApp state
  const whatsappHealth = useWhatsAppHealth();
  const whatsappStatus = useWhatsAppStatus();
  const connectWa = useWhatsAppConnect();
  const disconnectWa = useWhatsAppDisconnect();
  const [phone, setPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const waStatus = whatsappStatus.data?.status ?? "disconnected";
  const isConnecting = waStatus === "connecting" || waStatus === "creating";
  const isConnected  = waStatus === "connected";

  // Poll every 3s while connecting (and while we're waiting for pairing confirmation)
  useWhatsAppStatusPoller(isConnecting || (connectWa.isSuccess && !isConnected && !!pairingCode));

  // Auto-clear pairing code once connected
  useEffect(() => {
    if (isConnected && pairingCode) {
      setPairingCode(null);
      setConnectError(null);
      toast.success("تم ربط واتساب بنجاح ✅");
    }
  }, [isConnected, pairingCode]);

  async function handleConnect() {
    const cleaned = phone.replace(/\D/g, "").trim();
    if (!cleaned || cleaned.length < 7) {
      setConnectError("أدخل رقم الهاتف بدون + (مثال: 963912345678)");
      return;
    }
    setConnectError(null);
    try {
      const result = await connectWa.mutateAsync(cleaned);
      setPairingCode(result.pairingCode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : ar.errorGeneric;
      setConnectError(msg);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectWa.mutateAsync();
      setPairingCode(null);
      setPhone("");
      setConnectError(null);
      toast.success("تم قطع اتصال واتساب");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ar.errorGeneric);
    }
  }

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

      {/* ── WhatsApp Automation ─────────────────────────────────────── */}
      <WhatsAppSection
        status={waStatus}
        isConnected={isConnected}
        isConnecting={isConnecting}
        phone={phone}
        setPhone={setPhone}
        pairingCode={pairingCode}
        connectError={connectError}
        onClearError={() => setConnectError(null)}
        fireGroupsCount={whatsappStatus.data?.fire_groups_count ?? 0}
        connectedPhone={whatsappStatus.data?.phone_number ?? null}
        isPending={connectWa.isPending}
        isDisconnecting={disconnectWa.isPending}
        onConnect={() => void handleConnect()}
        onDisconnect={() => void handleDisconnect()}
        healthError={
          whatsappHealth.data && !whatsappHealth.data.ok
            ? whatsappHealth.data.error ?? "خدمة WhatsApp غير متوفرة"
            : null
        }
      />
    </div>
  );
}

/* ── WhatsApp Section Component ─────────────────────────────────────────── */

function WhatsAppSection({
  status,
  isConnected,
  isConnecting,
  phone,
  setPhone,
  pairingCode,
  connectError,
  onClearError,
  fireGroupsCount,
  connectedPhone,
  isPending,
  isDisconnecting,
  onConnect,
  onDisconnect,
  healthError,
}: {
  status: string;
  isConnected: boolean;
  isConnecting: boolean;
  phone: string;
  setPhone: (v: string) => void;
  pairingCode: string | null;
  connectError: string | null;
  onClearError: () => void;
  fireGroupsCount: number;
  connectedPhone: string | null;
  isPending: boolean;
  isDisconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  healthError: string | null;
}) {
  return (
    <motion.section
      className="mt-4 overflow-hidden rounded-2xl border border-[#25d366]/25 bg-[#0d1f14]/80 backdrop-blur-md"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25d366]/15 ring-1 ring-[#25d366]/30">
            <MessageCircle className="h-5 w-5 text-[#25d366]" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-semibold text-foreground">{ar.whatsappConnect}</p>
            <p className="text-[10px] text-steel-500">Texas Funds Automation</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Service-level health banner — shown before the state machine */}
      {healthError && (
        <div className="mx-5 mb-0 mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
          <span className="shrink-0 text-base">🔌</span>
          <div>
            <p className="text-xs font-semibold text-amber-400">خدمة Evolution API غير متاحة</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-amber-300/80">{healthError}</p>
            <p className="mt-1 text-[10px] text-steel-500">تحقق من إعدادات Railway → evolution-api service</p>
          </div>
        </div>
      )}

      <div className="px-5 py-4">
        <AnimatePresence mode="wait">

          {/* ── Connected ── */}
          {isConnected ? (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 rounded-xl bg-[#25d366]/10 px-4 py-3 ring-1 ring-[#25d366]/25">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#25d366]" />
                <div>
                  <p className="text-sm font-semibold text-[#25d366]">{ar.whatsappConnected}</p>
                  {connectedPhone && (
                    <p className="font-mono text-xs text-steel-400 mt-0.5">{connectedPhone}</p>
                  )}
                </div>
              </div>

              {/* Fire groups count */}
              <div className="flex items-center justify-between rounded-xl bg-obsidian/50 px-4 py-3 ring-1 ring-white/[0.06]">
                <div className="flex items-center gap-2 text-sm text-steel-400">
                  <Flame className="h-4 w-4 text-gold" />
                  {ar.whatsappFireGroups}
                </div>
                <span className="font-mono text-sm font-bold text-gold">
                  {fireGroupsCount}
                </span>
              </div>

              {/* Instructions */}
              <div className="rounded-xl bg-obsidian/40 px-4 py-3 ring-1 ring-white/[0.04] text-[11px] text-steel-400 leading-relaxed space-y-1.5">
                <p className="font-semibold text-steel-300 mb-2">كيف تستخدم البوت:</p>
                <p>🔥 أضف <strong className="text-gold">🔥</strong> لاسم أي مجموعة لتستقبل التقرير اليومي</p>
                <p>💰 اكتب <strong className="text-lime">💰 500</strong> لتسجيل كاش وصل منك</p>
                <p>📤 اكتب <strong className="text-lime">📤 250</strong> لتسجيل كاش واصل إليك</p>
                <p className="text-steel-500 mt-1">📊 يُرسل التقرير اليومي الساعة 4:00 صباحاً تلقائياً</p>
              </div>

              <Button
                variant="outline"
                className="w-full border-destructive/40 text-accent-negative hover:bg-destructive/10"
                disabled={isDisconnecting}
                onClick={onDisconnect}
              >
                {isDisconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <WifiOff className="mr-2 h-4 w-4" />
                )}
                {ar.whatsappDisconnect}
              </Button>
            </motion.div>

          ) : pairingCode ? (
            /* ── Pairing code display ── */
            <motion.div
              key="pairing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="text-center">
                <p className="text-xs text-steel-400 mb-3">{ar.whatsappPairingHint}</p>
                <div className="inline-block rounded-2xl border border-[#25d366]/40 bg-[#25d366]/10 px-6 py-5 ring-1 ring-[#25d366]/20">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#25d366]/70 mb-2">
                    {ar.whatsappPairingCode}
                  </p>
                  <p className="font-mono text-3xl font-bold tracking-[0.15em] text-[#25d366]">
                    {pairingCode}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-gold/5 px-4 py-3 ring-1 ring-gold/20">
                <Loader2 className="h-4 w-4 animate-spin text-gold shrink-0" />
                <p className="text-xs text-gold/90">{ar.whatsappConnecting}</p>
              </div>

              <ol className="space-y-2 text-[11px] text-steel-400 leading-relaxed">
                <li className="flex gap-2"><span className="text-gold font-bold">1.</span> افتح واتساب على هاتفك</li>
                <li className="flex gap-2"><span className="text-gold font-bold">2.</span> اضغط على النقاط الثلاث ← الأجهزة المرتبطة</li>
                <li className="flex gap-2"><span className="text-gold font-bold">3.</span> اضغط "ربط جهاز" ← "ربط بالرمز الهاتفي"</li>
                <li className="flex gap-2"><span className="text-gold font-bold">4.</span> أدخل الرمز أعلاه (صالح لمدة دقيقتين)</li>
              </ol>
            </motion.div>

          ) : (
            /* ── Disconnected / form ── */
            <motion.div
              key="disconnected"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <p className="text-xs text-steel-400">
                اربط حسابك على واتساب لتفعيل التقارير التلقائية وتتبع المدفوعات النقدية.
              </p>

              {/* Inline error — appears below description */}
              <AnimatePresence>
                {connectError && (
                  <motion.div
                    key="err"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3"
                  >
                    <span className="mt-0.5 shrink-0 text-base">⚠️</span>
                    <div className="flex-1">
                      <p className="text-xs leading-relaxed text-accent-negative">
                        {connectError}
                      </p>
                      <button
                        type="button"
                        onClick={onClearError}
                        className="mt-1.5 text-[10px] text-steel-400 underline underline-offset-2"
                      >
                        إغلاق
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label className="mb-1.5 block text-[11px] text-steel-400">
                  رقم الهاتف (بدون +)
                </label>
                <Input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, ""));
                    if (connectError) onClearError();
                  }}
                  placeholder={ar.whatsappPhonePlaceholder}
                  inputMode="tel"
                  className="border-steel-border/80 bg-obsidian/60 font-mono text-sm"
                  dir="ltr"
                  disabled={isPending}
                />
              </div>

              <Button
                className="w-full gap-2 bg-[#25d366] text-white hover:bg-[#1db954] active:bg-[#1aa34a] disabled:opacity-60"
                disabled={isPending || !phone.trim()}
                onClick={onConnect}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري الاتصال بـ Evolution API…
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4" />
                    {ar.whatsappConnect}
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-[#25d366]/15 px-3 py-1 text-[10px] font-semibold text-[#25d366] ring-1 ring-[#25d366]/30">
        <span className="h-1.5 w-1.5 rounded-full bg-[#25d366] animate-pulse" />
        متصل
      </span>
    );
  }
  if (status === "connecting" || status === "creating") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-[10px] font-semibold text-gold ring-1 ring-gold/25">
        <Loader2 className="h-3 w-3 animate-spin" />
        جاري الربط
      </span>
    );
  }
  return (
    <span className="rounded-full bg-steel-800/60 px-3 py-1 text-[10px] text-steel-500 ring-1 ring-white/[0.06]">
      {ar.whatsappDisconnected}
    </span>
  );
}
