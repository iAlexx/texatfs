"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Gift,
  KeyRound,
  Loader2,
  MessageCircle,
  Send,
  Shield,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData, useRedeemLicense, useReferralData } from "@/hooks/use-tma-api";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import {
  useTrackingStatus,
  useAutoCreateTracking,
  type AutoCreateResult,
} from "@/hooks/use-telegram-tracking-api";
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
  const { displayName, telegramUserId } = useTelegram();
  const hero     = useHeroData();
  const referral = useReferralData();
  const session  = useLedgerSession(todayIsoDate());
  const redeem   = useRedeemLicense();
  const [licenseKey, setLicenseKey] = useState("");

  const tracking    = useTrackingStatus(telegramUserId);
  const autoCreate  = useAutoCreateTracking();
  const [autoResult, setAutoResult] = useState<AutoCreateResult | null>(null);

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

      {/* ── Telegram Tracking System ─────────────────────────────────────────── */}
      <TelegramTrackingSection
        status={tracking.data}
        isLoading={tracking.isLoading}
        isCreating={autoCreate.isPending}
        createError={
          autoCreate.error instanceof Error ? autoCreate.error.message : null
        }
        autoResult={autoResult}
        onAutoCreate={() => {
          autoCreate.mutate(undefined, {
            onSuccess: (r) => {
              setAutoResult(r);
              toast.success("تم إنشاء المجموعة! جاري إنشاء المواضيع في الخلفية…");
            },
            onError: (err) => {
              toast.error(
                err.message ?? "فشل الإنشاء التلقائي. جرّب الإعداد اليدوي."
              );
            },
          });
        }}
      />
    </div>
  );
}

/* ── TelegramTrackingSection ─────────────────────────────────────────────────── */

function TelegramTrackingSection({
  status,
  isLoading,
  isCreating,
  createError,
  autoResult,
  onAutoCreate,
}: {
  status: { active: boolean; chatTitle: string | null; topicCount: number; chatId?: number | null } | undefined;
  isLoading: boolean;
  isCreating: boolean;
  createError: string | null;
  autoResult: AutoCreateResult | null;
  onAutoCreate: () => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  const botInviteUrl = botUsername
    ? `https://t.me/${botUsername}?startgroup=activate`
    : "https://t.me/";

  const isActive = status?.active ?? false;

  // Derive the group link from either the latest auto-create result or the
  // persisted status (so the link survives a page refresh).
  const groupLink = (() => {
    const id = autoResult?.chatId ?? status?.chatId ?? null;
    if (!id) return null;
    const bare = String(Math.abs(id)).substring(3);
    return `https://t.me/c/${bare}`;
  })();

  return (
    <motion.section
      className="mt-4 overflow-hidden rounded-2xl border border-[#279eff]/25 bg-[#0d1525]/80 backdrop-blur-md"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#279eff]/15 ring-1 ring-[#279eff]/30">
            <Send className="h-5 w-5 text-[#279eff]" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-semibold text-foreground">نظام التتبع عبر تلغرام</p>
            <p className="text-[10px] text-steel-500">Texas Funds · Forum Topics</p>
          </div>
        </div>

        {isLoading ? (
          <span className="rounded-full bg-steel-800/60 px-3 py-1 text-[10px] text-steel-500 ring-1 ring-white/[0.06]">
            <Loader2 className="inline h-3 w-3 animate-spin" />
          </span>
        ) : isActive ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#279eff]/15 px-3 py-1 text-[10px] font-semibold text-[#279eff] ring-1 ring-[#279eff]/30">
            <span className="h-1.5 w-1.5 rounded-full bg-[#279eff] animate-pulse" />
            مفعّل
          </span>
        ) : (
          <span className="rounded-full bg-steel-800/60 px-3 py-1 text-[10px] text-steel-500 ring-1 ring-white/[0.06]">
            غير مفعّل
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <AnimatePresence mode="wait">

          {/* ════════════════════ ACTIVE STATE ════════════════════ */}
          {isActive ? (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Activation banner */}
              <div className="flex items-center gap-3 rounded-xl bg-[#279eff]/10 px-4 py-3 ring-1 ring-[#279eff]/25">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#279eff]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#279eff]">نظام التتبع مفعّل</p>
                  {status?.chatTitle && (
                    <p className="mt-0.5 truncate text-xs text-steel-400">{status.chatTitle}</p>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between rounded-xl bg-obsidian/50 px-4 py-3 ring-1 ring-white/[0.06]">
                <div className="flex items-center gap-2 text-sm text-steel-400">
                  <MessageCircle className="h-4 w-4 text-[#279eff]" />
                  مواضيع الوكلاء
                </div>
                <span className="font-mono text-sm font-bold text-[#279eff]">
                  {status?.topicCount ?? 0}
                </span>
              </div>

              {/* Group link */}
              {groupLink && (
                <a
                  href={groupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5",
                    "border border-[#279eff]/30 bg-[#279eff]/10 text-[#279eff] text-xs font-semibold",
                    "hover:bg-[#279eff]/20 transition-colors"
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                  فتح مجموعة التتبع
                </a>
              )}

              {/* Usage hints */}
              <div className="rounded-xl bg-obsidian/40 px-4 py-3 ring-1 ring-white/[0.04] text-[11px] text-steel-400 leading-relaxed space-y-1.5">
                <p className="font-semibold text-steel-300 mb-2">كيف يعمل النظام:</p>
                <p>📊 التقرير اليومي الساعة <strong className="text-[#279eff]">4:00 ص</strong> (دمشق) في موضوع كل وكيل</p>
                <p>💰 <strong className="text-lime">💰 500</strong> في موضوع الوكيل → كاش وصل منك</p>
                <p>📤 <strong className="text-lime">📤 250</strong> في موضوع الوكيل → كاش واصل إليك</p>
              </div>
            </motion.div>

          ) : (
            /* ════════════════════ INACTIVE STATE ════════════════════ */
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <p className="text-xs text-steel-400">
                فعّل نظام التتبع لاستقبال تقارير يومية دقيقة لكل وكيل فرعي مباشرةً في مجموعة تلغرام خاصة بك.
              </p>

              {/* ── Primary CTA: Auto-create ──────────────────────────── */}
              <Button
                variant="gold"
                className="w-full gap-2 text-sm"
                disabled={isCreating}
                onClick={onAutoCreate}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جاري إنشاء المجموعة وتفعيل المواضيع تلقائياً… ⚡</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    إنشاء نظام التتبع (تلقائي)
                  </>
                )}
              </Button>

              {isCreating && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-[10px] text-[#279eff]/80 leading-relaxed"
                >
                  يتم إنشاء المجموعة، تفعيل Forum mode، إضافة البوت، وترقيته لمشرف…
                  <br />
                  قد يستغرق هذا 5–10 ثوانٍ.
                </motion.p>
              )}

              {/* Error message */}
              {createError && !isCreating && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-destructive/10 px-3 py-2.5 text-center text-[11px] text-accent-negative ring-1 ring-destructive/20"
                >
                  {createError}
                </motion.p>
              )}

              {/* ── Collapsible manual instructions ─────────────────────── */}
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setManualOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-[11px] text-steel-400 hover:text-steel-300 transition-colors"
                >
                  <span>طريقة التفعيل اليدوي (إذا واجهت مشكلة)</span>
                  <motion.span
                    animate={{ rotate: manualOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-steel-500"
                  >
                    ▾
                  </motion.span>
                </button>

                <AnimatePresence>
                  {manualOpen && (
                    <motion.div
                      key="manual"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
                        <ol className="space-y-3">
                          {[
                            {
                              n: "1",
                              text: (
                                <>
                                  أنشئ مجموعة جديدة وسمّها:{" "}
                                  <strong className="text-gold">اسمك - Texas Tracking 🔥</strong>
                                </>
                              ),
                            },
                            {
                              n: "2",
                              text: (
                                <>
                                  افتح <strong className="text-steel-200">إعدادات المجموعة</strong> ← فعّل{" "}
                                  <strong className="text-[#279eff]">المواضيع (Topics / Forum)</strong>
                                </>
                              ),
                            },
                            {
                              n: "3",
                              text: (
                                <>
                                  أضف البوت كـ<strong className="text-steel-200">مشرف</strong> مع{" "}
                                  <strong className="text-lime">إدارة المواضيع</strong> و{" "}
                                  <strong className="text-lime">نشر الرسائل</strong>
                                </>
                              ),
                            },
                            {
                              n: "4",
                              text: <>بمجرد إضافة البوت سيُنشئ المواضيع تلقائياً ويُرسل تأكيداً.</>,
                            },
                          ].map((step) => (
                            <li key={step.n} className="flex gap-3 text-[11px] text-steel-400 leading-relaxed">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#279eff]/20 text-[10px] font-bold text-[#279eff]">
                                {step.n}
                              </span>
                              <span>{step.text}</span>
                            </li>
                          ))}
                        </ol>

                        <a
                          href={botInviteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5",
                            "border border-[#279eff]/40 bg-[#279eff]/10 text-[#279eff] text-sm font-semibold",
                            "hover:bg-[#279eff]/20 transition-colors",
                            !botUsername && "pointer-events-none opacity-50"
                          )}
                        >
                          <Send className="h-4 w-4" />
                          إضافة البوت يدوياً
                        </a>

                        {!botUsername && (
                          <p className="text-center text-[10px] text-amber-400">
                            عيّن <code className="font-mono">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code> في Railway
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <p className="text-center text-[10px] text-steel-500">
                ستتحدث هذه الصفحة تلقائياً بمجرد التفعيل.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
