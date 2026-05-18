import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/AppProviders";
import { cairo } from "@/lib/fonts";
import { TelegramScript } from "@/components/providers/TelegramScript";
import "./globals.css";

export const metadata: Metadata = {
  title: "تكساس فاندز | TEXAS FUNDS",
  description: "سجل يومي فاخر — تطبيق تيليغرام",
};

export const viewport: Viewport = {
  themeColor: "#0a0e17",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`h-full ${cairo.variable}`}>
      <body className={`${cairo.className} min-h-full bg-background font-sans antialiased`}>
        <TelegramScript />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
