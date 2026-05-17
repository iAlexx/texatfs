"use client";

import { TelegramProvider } from "@/components/providers/TelegramProvider";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return <TelegramProvider>{children}</TelegramProvider>;
}
