import type { ReactNode } from "react";
import { TmaShell } from "@/components/tma/TmaShell";

export default function TmaLayout({ children }: { children: ReactNode }) {
  return <TmaShell>{children}</TmaShell>;
}
