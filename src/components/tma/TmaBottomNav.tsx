"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, User, Users } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { ar } from "@/lib/i18n/ar";

const tabs = [
  { href: "/home", label: ar.navHome, icon: Home },
  { href: "/ledger", label: ar.navAgents, icon: Users },
  { href: "/whatsapp", label: ar.navWhatsapp, icon: MessageCircle },
  { href: "/profile", label: ar.navProfile, icon: User },
] as const;

export function TmaBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <div className="nav-float pointer-events-auto flex w-full max-w-md items-stretch justify-around rounded-2xl px-1.5 py-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href === "/home" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] transition-colors",
                active ? "text-white" : "text-steel-500"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="nav-active-glow absolute inset-0 rounded-xl ring-1 ring-violet-500/30"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <motion.span
                animate={active ? { scale: 1.08, y: -1 } : { scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 24 }}
                className="relative z-10"
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.5} />
              </motion.span>
              <span className="relative z-10 font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
