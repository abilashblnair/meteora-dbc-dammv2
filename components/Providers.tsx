"use client";

import { rpcUrlFor } from "@/lib/env";
import { NETWORKS, type SolanaNetwork } from "@/lib/meteora/constants";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

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
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function NetworkSelect() {
  const { network, setNetwork } = useNetwork();
  return (
    <select
      className="network-select"
      aria-label="Solana network"
      value={network}
      onChange={(event) => setNetwork(event.target.value as SolanaNetwork)}
    >
      {NETWORKS.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
}
