"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, User } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { ar } from "@/lib/i18n/ar";

const tabs = [
  { href: "/home", label: ar.navHome, icon: Home },
  { href: "/ledger", label: ar.navLedger, icon: BookOpen },
  { href: "/profile", label: ar.navProfile, icon: User },
] as const;

export function TmaBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="glass-nav fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md">
      <div className="flex items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href === "/home" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] transition-colors",
                active ? "text-gold" : "text-steel-500"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-xl bg-gold/10 ring-1 ring-gold/30"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon
                className="relative z-10 h-5 w-5"
                strokeWidth={active ? 2 : 1.5}
              />
              <span className="relative z-10 font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
