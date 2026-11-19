import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import SiteHeader from "@/components/layout/SiteHeader";
import Splash from "@/components/brand/Splash";
import StakeGate from "@/components/auth/StakeGate";
import AppFooter from "@/components/layout/AppFooter";
import MobileBar from "@/components/layout/MobileBar";

export const metadata: Metadata = {
  title: "KellyBets — Sportsbook, Live Betting & Casino",
  description:
    "Bet on football, basketball, tennis, cricket and e-sports with live odds, accumulators, Aviator crash games, casino, multi-currency wallets and instant mobile money deposits.",
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="stripe-bg min-h-screen text-slate-100 antialiased">
        <AppProviders>
          <Splash />
          <SiteHeader />
          <main className="pb-24 lg:pb-0">{children}</main>
          <AppFooter />
          <MobileBar />
          <StakeGate />
        </AppProviders>
      </body>
    </html>
  );
}
