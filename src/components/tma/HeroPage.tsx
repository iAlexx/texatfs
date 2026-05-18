"use client";

import { motion } from "framer-motion";
import { Crown, Sparkles, TrendingUp } from "lucide-react";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData } from "@/hooks/use-tma-api";
import { ar } from "@/lib/i18n/ar";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function HeroPage() {
  const { displayName } = useTelegram();
  const hero = useHeroData();
  const name = hero.data?.user.display_name ?? displayName ?? "ماستر";

  return (
    <div className="px-4 pt-8">
      <motion.section
        className="glass-hero relative min-h-[70vh] overflow-hidden rounded-3xl p-6"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gold/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-lime/10 blur-3xl" />

        <div className="relative z-10">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold/80">
            <Crown className="h-4 w-4" strokeWidth={1.5} />
            {ar.brandEn}
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-foreground">
            أهلاً بعودتك، {name}{" "}
            <span className="inline-block" aria-hidden>
              👑
            </span>
          </h1>
          <p className="mt-2 text-sm text-steel-400">{ar.brand}</p>

          {hero.data?.announcement ? (
            <motion.p
              className="glass-inner mt-6 rounded-2xl border border-gold/20 p-4 text-sm leading-relaxed text-steel-300"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {hero.data.announcement}
            </motion.p>
          ) : null}

          <div className="mt-8 grid gap-3">
            <StatCard
              label="حالة الاشتراك"
              value={
                hero.data?.user.subscription_active
                  ? "فعّال"
                  : "منتهي"
              }
              variant={
                hero.data?.user.subscription_active ? "lime" : "muted"
              }
              loading={hero.isLoading}
            />
            <StatCard
              label="تقييم الأداء"
              value={hero.data?.performance_rating ?? "—"}
              variant="gold"
              icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
              loading={hero.isLoading}
            />
            {hero.data?.al_nihai != null && (
              <StatCard
                label={ar.finalBalance}
                value={formatMoney(hero.data.al_nihai)}
                variant="gold"
                icon={<Sparkles className="h-4 w-4" strokeWidth={1.5} />}
              />
            )}
          </div>
        </div>
      </motion.section>
    </div>
  );
}

function StatCard({
  label,
  value,
  variant,
  icon,
  loading,
}: {
  label: string;
  value: string;
  variant: "gold" | "lime" | "muted";
  icon?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="glass-inner flex items-center justify-between rounded-2xl px-4 py-3">
      <div>
        <p className="text-[10px] text-steel-500">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-sm font-semibold",
            variant === "gold" && "text-gold",
            variant === "lime" && "text-lime",
            variant === "muted" && "text-steel-400",
            loading && "animate-pulse"
          )}
        >
          {value}
        </p>
      </div>
      {icon ? <span className="text-gold/80">{icon}</span> : null}
    </div>
  );
}
