"use client";

import { rpcUrlFor } from "@/lib/env";
import { NETWORKS, type SolanaNetwork } from "@/lib/meteora/constants";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "stockcurve.network";

const NetworkContext = createContext<{
  network: SolanaNetwork;
  setNetwork: (network: SolanaNetwork) => void;
}>({ network: "devnet", setNetwork: () => undefined });

export function useNetwork() {
  return useContext(NetworkContext);
}

export function Providers({ children, initialNetwork }: { children: ReactNode; initialNetwork: SolanaNetwork }) {
  const [network, setNetworkState] = useState<SolanaNetwork>(initialNetwork);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "devnet" || stored === "mainnet-beta") setNetworkState(stored);
  }, []);

  const setNetwork = (next: SolanaNetwork) => {
    setNetworkState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      <SolanaBoundary network={network}>{children}</SolanaBoundary>
    </NetworkContext.Provider>
  );
}

function SolanaBoundary({ network, children }: { network: SolanaNetwork; children: ReactNode }) {
  const endpoint = rpcUrlFor(network);
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({
        network: network === "devnet" ? WalletAdapterNetwork.Devnet : WalletAdapterNetwork.Mainnet,
      }),
    ],
    [network],
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function NetworkSelect() {
  const { network, setNetwork } = useNetwork();
  return (
    <div className="network-toggle" role="radiogroup" aria-label="Solana network">
      {NETWORKS.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={item === network}
          className={`${item === network ? "active" : ""} ${item === "devnet" ? "devnet" : "mainnet"}`}
          onClick={() => setNetwork(item)}
        >
          <span className="dot" aria-hidden="true" />
          <span className="label-full">{item === "devnet" ? "Devnet" : "Mainnet"}</span>
          <span className="label-short" aria-hidden="true">{item === "devnet" ? "Dev" : "Main"}</span>
        </button>
      ))}
    </div>
  );
}
