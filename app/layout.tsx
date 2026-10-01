import { Providers } from "@/components/Providers";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { defaultNetwork } from "@/lib/env";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockCurve",
  description: "Equity and RWA token launchpad using Meteora Dynamic Bonding Curve and DAMM v2.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,560&family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@400;560;650&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers initialNetwork={defaultNetwork()}>
          <SiteHeader />
          <main className="shell">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
