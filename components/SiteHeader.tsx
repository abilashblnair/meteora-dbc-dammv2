"use client";

import { NetworkSelect } from "@/components/Providers";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="#1c241c" />
          <path d="M10 46c8-2 10-18 18-20 6-1.5 8 8 14 8 6 0 8-14 12-16" stroke="#c4963a" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span>
          <strong>StockCurve</strong>
          <span>Equity launch desk</span>
        </span>
      </Link>
      <nav className="nav">
        <Link href="/marketplace">Presets</Link>
        <Link href="/launch">Launch</Link>
        <Link href="/launches">Book</Link>
      </nav>
      <div className="header-tools">
        <NetworkSelect />
        <WalletMultiButton />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        StockCurve builds Meteora Dynamic Bonding Curve configs and graduates completed pools into DAMM v2.
        Transactions are signed in your wallet. A confirmed signature is the only success signal.
      </p>
    </footer>
  );
}
