"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { useHeroData, useRedeemLicense } from "@/hooks/use-tma-api";
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ar } from "@/lib/i18n/ar";

function roleLabel(role: string): string {
  if (role === "master") return ar.roleMaster;
  if (role === "player") return ar.rolePlayer;
  return ar.roleSuperMaster;
}

export function ProfilePage() {
  const { displayName } = useTelegram();
  const hero = useHeroData();
  const session = useLedgerSession(todayIsoDate());
  const redeem = useRedeemLicense();
  const [licenseKey, setLicenseKey] = useState("");

  const user = hero.data?.user ?? session.data?.user;
  const endDate = user?.subscription_end_date;

  async function handleRedeem() {
    if (!licenseKey.trim()) return;
    try {
      await redeem.mutateAsync(licenseKey.trim());
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

      <section className="glass-panel mb-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 ring-1 ring-gold/30">
            <User className="h-6 w-6 text-gold" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-semibold">{user?.display_name ?? displayName}</p>
            <p className="text-xs text-steel-500">{user?.texas_username}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-lime/15 px-3 py-1 text-xs text-lime ring-1 ring-lime/30">
            <Shield className="mr-1 inline h-3 w-3" />
            {user ? roleLabel(user.role) : "—"}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs ring-1 ${
              user?.subscription_active
                ? "bg-lime/10 text-lime ring-lime/25"
                : "bg-destructive/10 text-accent-negative ring-destructive/30"
            }`}
          >
            {user?.subscription_active ? "اشتراك فعّال" : "اشتراك منتهي"}
          </span>
        </div>
        {endDate && (
          <p className="mt-3 text-xs text-steel-500">
            ينتهي في:{" "}
            {new Date(endDate).toLocaleDateString("ar-SY", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}
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
    </div>
  );
}
