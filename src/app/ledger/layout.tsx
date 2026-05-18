import type { ReactNode } from "react";

export default function LedgerLayout({ children }: { children: ReactNode }) {
  return <div className="ledger-shell executive-bg">{children}</div>;
}
