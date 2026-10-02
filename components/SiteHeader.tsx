"use client";

import { NetworkSelect } from "@/components/Providers";
import { WalletConnect } from "@/components/WalletConnect";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/marketplace", label: "Presets" },
  { href: "/launch", label: "Launch" },
  { href: "/launches", label: "Book" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/">
          <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M6 50c9-2 11-20 20-22 7-1.6 9 9 16 9 7 0 9-16 14-18" stroke="#c4963a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="56" cy="19" r="5" fill="#4fbf7f" />
          </svg>
          <span>
            <strong>StockCurve</strong>
            <span>Equity launch desk</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href === "/launches" && pathname.startsWith("/pool/"));
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="header-tools">
          <NetworkSelect />
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>StockCurve</strong>
        <p>
          Builds Meteora Dynamic Bonding Curve configs and graduates completed pools into DAMM v2. Transactions are signed
          in your wallet. A confirmed signature is the only success signal.
        </p>
      </div>
      <nav aria-label="Resources">
        <a href="https://github.com/abilashblnair/meteora-dbc-dammv2" target="_blank" rel="noreferrer">Source</a>
        <a href="https://docs.meteora.ag/developer-guides/dbc" target="_blank" rel="noreferrer">DBC docs</a>
        <a href="https://docs.meteora.ag/developer-guides/damm-v2" target="_blank" rel="noreferrer">DAMM v2 docs</a>
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">Devnet faucet</a>
      </nav>
    </footer>
  );
}
