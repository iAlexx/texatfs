"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-api";
import { LicenseGenerator } from "@/components/admin/LicenseGenerator";
import { UsersTable } from "@/components/admin/UsersTable";
import { HealthPanel } from "@/components/admin/HealthPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminDashboard() {
  const session = useAdminSession();

  if (session.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        Verifying Super Admin access…
      </div>
    );
  }

  if (session.isError) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-8 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold text-destructive">Access denied</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {session.error instanceof Error
            ? session.error.message
            : "You must open this page as a configured Super Admin."}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Set <code className="text-gold">TELEGRAM_ADMIN_IDS</code> and open{" "}
          <code className="text-gold">/admin</code> from Telegram, or use dev mode
          with <code className="text-gold">NEXT_PUBLIC_DEV_TELEGRAM_ID</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <div className="flex items-center gap-2 text-gold">
          <ShieldCheck className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-widest">
            Super Admin
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="admin-gold-text">TEXAS FUNDS</span> Control Panel
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as Telegram admin #{session.data?.telegramUserId}
        </p>
      </header>

      <Tabs defaultValue="licenses" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3 bg-muted/60">
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
        </TabsList>
        <TabsContent value="licenses" className="mt-6">
          <LicenseGenerator />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersTable />
        </TabsContent>
        <TabsContent value="health" className="mt-6">
          <HealthPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
