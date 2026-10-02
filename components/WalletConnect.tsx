"use client";
/* eslint-disable @next/next/no-img-element -- wallet icons are data URIs from the adapters. */

import { useNetwork } from "@/components/Providers";
import { explorerAccount, shortKey } from "@/lib/format";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FAUCET_URL = "https://faucet.solana.com";

/** Header wallet control: connect button, wallet picker, and the connected account menu. */
export function WalletConnect() {
  const { wallet, publicKey, connected, connecting, disconnect } = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const account = connected ? publicKey?.toBase58() : undefined;

  // Connecting swaps this component to its connected layout, which remounts the picker, so the
  // picker cannot close itself. Close it here whenever a wallet account becomes connected.
  useEffect(() => {
    if (account) setPickerOpen(false);
  }, [account]);

  if (!connected || !publicKey) {
    return (
      <>
        <button className="wallet-trigger" type="button" onClick={() => setPickerOpen(true)} disabled={connecting}>
          {connecting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Connecting…
            </>
          ) : (
            "Connect wallet"
          )}
        </button>
        {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
      </>
    );
  }

  return (
    <div className="wallet-account">
      <button
        className="wallet-trigger connected"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {wallet && <img src={wallet.adapter.icon} alt="" width={20} height={20} />}
        <span className="mono">{shortKey(publicKey.toBase58(), 4)}</span>
        <Balance />
      </button>
      {menuOpen && (
        <AccountMenu
          address={publicKey.toBase58()}
          walletName={wallet?.adapter.name ?? "Wallet"}
          onClose={() => setMenuOpen(false)}
          onChange={() => {
            setMenuOpen(false);
            setPickerOpen(true);
          }}
          onDisconnect={() => {
            setMenuOpen(false);
            void disconnect();
          }}
        />
      )}
      {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}

function Balance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [lamports, setLamports] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    let live = true;
    setLamports(null);
    connection
      .getBalance(publicKey, "confirmed")
      .then((value) => live && setLamports(value))
      .catch(() => live && setLamports(null));
    const id = connection.onAccountChange(publicKey, (account) => live && setLamports(account.lamports), "confirmed");
    return () => {
      live = false;
      void connection.removeAccountChangeListener(id);
    };
  }, [connection, publicKey]);

  if (lamports === null) return null;
  return <span className="wallet-balance mono">{(lamports / LAMPORTS_PER_SOL).toFixed(lamports < LAMPORTS_PER_SOL ? 3 : 2)} SOL</span>;
}

function AccountMenu({
  address,
  walletName,
  onClose,
  onChange,
  onDisconnect,
}: {
  address: string;
  walletName: string;
  onClose: () => void;
  onChange: () => void;
  onDisconnect: () => void;
}) {
  const { network } = useNetwork();
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="wallet-menu" role="menu" ref={ref}>
      <div className="wallet-menu-head">
        <span className="fine">{walletName} · {network}</span>
        <span className="mono wallet-menu-address">{shortKey(address, 8)}</span>
        <Balance />
      </div>
      <button role="menuitem" type="button" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy address"}
      </button>
      <a role="menuitem" href={explorerAccount(address, network)} target="_blank" rel="noreferrer">
        View on explorer ↗
      </a>
      {network === "devnet" && (
        <a role="menuitem" href={FAUCET_URL} target="_blank" rel="noreferrer">
          Get devnet SOL ↗
        </a>
      )}
      <button role="menuitem" type="button" onClick={onChange}>
        Change wallet
      </button>
      <button role="menuitem" type="button" className="danger" onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}

function WalletPicker({ onClose }: { onClose: () => void }) {
  const { wallets, wallet, select, connect, connected, connecting } = useWallet();
  const { network } = useNetwork();
  const [pending, setPending] = useState<WalletName | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const ready = wallets.filter(
    (item) => item.readyState === WalletReadyState.Installed || item.readyState === WalletReadyState.Loadable,
  );
  const missing = wallets.filter((item) => item.readyState === WalletReadyState.NotDetected);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button.wallet-option")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // select() swaps the adapter; connect once the provider holds the one the user picked.
  useEffect(() => {
    if (!pending || wallet?.adapter.name !== pending) return;
    if (connected) {
      setPending(null);
      onClose();
      return;
    }
    if (connecting) return;
    connect().catch((cause: unknown) => {
      setPending(null);
      const message = cause instanceof Error && cause.message ? cause.message : "The wallet did not connect.";
      setError(/reject/i.test(message) ? "Connection request was rejected in the wallet." : message);
    });
  }, [pending, wallet, connected, connecting, connect, onClose]);

  const choose = useCallback(
    (name: WalletName) => {
      setError("");
      setPending(name);
      select(name);
    },
    [select],
  );

  return createPortal(
    <div className="modal-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title" ref={dialogRef}>
        <div className="modal-head">
          <div>
            <p className="kicker">Wallet</p>
            <h2 id="wallet-title">Connect a wallet</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className={`network-note ${network === "devnet" ? "devnet" : "mainnet"}`}>
          <span className="dot" aria-hidden="true" />
          <span>
            StockCurve is on <strong>{network}</strong>. Set your wallet to the same network before signing.
          </span>
        </p>
        <div className="wallet-list">
          {ready.map((item) => {
            const name = item.adapter.name;
            const busy = pending === name;
            return (
              <button key={name} className="wallet-option" type="button" onClick={() => choose(name)} disabled={Boolean(pending)}>
                <img src={item.adapter.icon} alt="" width={32} height={32} />
                <span className="wallet-option-name">{name}</span>
                {busy ? (
                  <span className="wallet-option-state">
                    <span className="spinner" aria-hidden="true" /> Approve in wallet
                  </span>
                ) : (
                  <span className="pill ok">Detected</span>
                )}
              </button>
            );
          })}
          {missing.map((item) => (
            <a key={item.adapter.name} className="wallet-option muted-option" href={item.adapter.url} target="_blank" rel="noreferrer">
              <img src={item.adapter.icon} alt="" width={32} height={32} />
              <span className="wallet-option-name">{item.adapter.name}</span>
              <span className="pill">Install ↗</span>
            </a>
          ))}
        </div>
        {ready.length === 0 && (
          <p className="fine">No Solana wallet extension was found in this browser. Install Phantom or Solflare, then reload the page.</p>
        )}
        {error && <p className="status error">{error}</p>}
        <p className="fine modal-foot">
          StockCurve never holds keys. Every transaction is built in the browser and signed in your wallet.
        </p>
      </div>
    </div>,
    document.body,
  );
}
