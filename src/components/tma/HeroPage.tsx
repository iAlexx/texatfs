"use client";

import { motion } from "framer-motion";
import { Crown, Flame, TrendingUp, Brain } from "lucide-react";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData } from "@/hooks/use-tma-api";
import { ar } from "@/lib/i18n/ar";
import { formatMoney } from "@/lib/utils/format";
import { GlassMetricCard } from "@/components/ui/GlassMetricCard";
import { LivePulseDot } from "@/components/ui/LivePulseDot";
import { VaultChart } from "@/components/tma/VaultChart";

export function HeroPage() {
  const { displayName } = useTelegram();
  const hero = useHeroData();
  const name = hero.data?.user.display_name ?? displayName ?? "ماستر";
  const live = Boolean(hero.data?.synced_today);

  return (
    <div className="px-4 pt-6">
      <motion.section
        className="hero-gradient-elite relative min-h-[72vh] overflow-hidden rounded-3xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-40"
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(184,255,60,0.15), transparent 40%), radial-gradient(circle at 80% 80%, rgba(212,175,55,0.2), transparent 45%)",
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold/90">
              <Crown className="h-4 w-4" strokeWidth={1.5} />
              {ar.brandEn}
            </p>
            <LivePulseDot live={live} />
          </div>

          <h1 className="mt-4 text-3xl font-bold leading-tight">
            أهلاً بعودتك، {name}{" "}
            <span aria-hidden>👑</span>
          </h1>
          <p className="mt-2 text-sm text-steel-300">{ar.brand}</p>

          {hero.data?.announcement ? (
            <motion.p
              className="glass-inner mt-5 rounded-2xl border border-gold/25 p-4 text-sm leading-relaxed text-steel-200"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {hero.data.announcement}
            </motion.p>
          ) : null}

          {hero.data?.al_nihai != null && (
            <motion.div
              className="mt-8 text-center"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
            >
              <p className="text-[10px] uppercase tracking-widest text-gold/70">
                {ar.finalBalance}
              </p>
              <p className="embossed-gold mt-1 text-4xl">{formatMoney(hero.data.al_nihai)}</p>
            </motion.div>
          )}

          <motion.div className="mt-6 grid gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <GlassMetricCard
              label="حالة الاشتراك"
              value={hero.data?.user.subscription_active ? "فعّال" : "منتهي"}
              variant={hero.data?.user.subscription_active ? "lime" : "muted"}
            />
            {hero.data?.network_total_burn != null &&
            hero.data.network_agent_count > 0 ? (
              <GlassMetricCard
                label={ar.networkTotalBurn}
                value={formatMoney(hero.data.network_total_burn)}
                variant="gold"
                icon={<Flame className="h-4 w-4 text-accent-negative" strokeWidth={1.5} />}
                pulse
              />
            ) : null}
            <GlassMetricCard
              label="تقييم الأداء"
              value={hero.data?.performance_rating ?? "—"}
              variant="gold"
              icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
            />
            {hero.data?.ai_insight && (
              <GlassMetricCard
                label={ar.aiInsight}
                value={
                  <span className="text-xs font-normal leading-relaxed text-steel-300">
                    {hero.data.ai_insight}
                  </span>
                }
                variant="gold"
                icon={<Brain className="h-4 w-4" strokeWidth={1.5} />}
              />
            )}
          </motion.div>

          {hero.data?.vault && hero.data.vault.series.length > 0 && (
            <VaultChart
              series={hero.data.vault.series}
              days7={hero.data.vault.days7}
              days30={hero.data.vault.days30}
            />
          )}
        </div>
      </motion.section>
    </div>
  );
}
