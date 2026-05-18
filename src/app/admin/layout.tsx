import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-theme min-h-screen bg-background text-foreground" dir="ltr">
      {children}
    </div>
  );
}
