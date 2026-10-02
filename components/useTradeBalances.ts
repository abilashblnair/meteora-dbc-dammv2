"use client";

import { NATIVE_SOL_MINT } from "@/lib/meteora/constants";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type Connection } from "@solana/web3.js";
import BN from "bn.js";
import { useCallback, useEffect, useState } from "react";

/** SOL kept back by "Max" on a SOL buy: fees plus rent for the token accounts the swap may open. */
export const SOL_FEE_RESERVE = new BN(10_000_000);

export interface TradeBalances {
  /** Spendable quote in raw units: native lamports for SOL pools, token units for USDC pools. */
  quote: BN | null;
  /** Base token held, raw units. Zero when the wallet has no token account yet. */
  base: BN | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

async function tokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<BN> {
  // Parsed lookup by mint covers both SPL Token and Token-2022 accounts, and any non-ATA holdings.
  const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
  return value.reduce((sum, item) => sum.add(new BN(item.account.data.parsed.info.tokenAmount.amount as string)), new BN(0));
}

/** The connected wallet's balances for one pool's quote and base mints. Null until a wallet connects. */
export function useTradeBalances(quoteMint: string | undefined, baseMint: string | undefined): TradeBalances {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [quote, setQuote] = useState<BN | null>(null);
  const [base, setBase] = useState<BN | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey || !quoteMint || !baseMint) {
      setQuote(null);
      setBase(null);
      return;
    }
    setLoading(true);
    try {
      const [nextQuote, nextBase] = await Promise.all([
        quoteMint === NATIVE_SOL_MINT
          ? connection.getBalance(publicKey, "confirmed").then((lamports) => new BN(lamports))
          : tokenBalance(connection, publicKey, new PublicKey(quoteMint)),
        tokenBalance(connection, publicKey, new PublicKey(baseMint)),
      ]);
      setQuote(nextQuote);
      setBase(nextBase);
    } catch {
      // A failed read leaves the last known balances; the swap itself still checks on-chain.
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, quoteMint, baseMint]);

  useEffect(() => {
    void refresh();
    if (!publicKey || quoteMint !== NATIVE_SOL_MINT) return;
    const id = connection.onAccountChange(publicKey, (account) => setQuote(new BN(account.lamports)), "confirmed");
    return () => {
      void connection.removeAccountChangeListener(id);
    };
  }, [refresh, connection, publicKey, quoteMint]);

  return { quote, base, loading, refresh };
}
