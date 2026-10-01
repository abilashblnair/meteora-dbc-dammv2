"use client";

import { useNetwork } from "@/components/Providers";
import { explainError } from "@/lib/errors";
import { explorerAccount, explorerTx, formatRaw, percent, shortKey } from "@/lib/format";
import {
  buildDammSwapTransaction,
  buildDbcSwapTransaction,
  buildGraduationTransaction,
  loadDammSnapshot,
  loadPoolSnapshot,
  quoteDammSwap,
  quoteDbcSwap,
  type DammSnapshot,
  type PoolSnapshot,
} from "@/lib/meteora/actions";
import { rawFromUi, uiFromRaw } from "@/lib/meteora/curve";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, type Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { useCallback, useEffect, useState } from "react";

export function PoolDesk({ address }: { address: string }) {
  const { network } = useNetwork();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [snapshot, setSnapshot] = useState<PoolSnapshot | null>(null);
  const [damm, setDamm] = useState<DammSnapshot | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [partialFill, setPartialFill] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [dammAmount, setDammAmount] = useState("0.05");
  const [dammQuote, setDammQuote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadPoolSnapshot(connection, address);
      setSnapshot(next);
      if (next) setDamm(await loadDammSnapshot(connection, next.dammPool));
      else setDamm(null);
    } catch (cause) {
      setError(explainError(cause));
    } finally {
      setLoading(false);
    }
  }, [address, connection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signAndSend(transaction: Transaction, signers: Keypair[]) {
    if (!publicKey) throw new Error("Connect a wallet before signing.");
    const latest = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = publicKey;
    transaction.recentBlockhash = latest.blockhash;
    if (signers.length > 0) transaction.partialSign(...signers);
    const signature = await sendTransaction(transaction, connection, { signers });
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed",
    );
    if (confirmation.value.err) throw new Error(`RPC confirmed an error: ${JSON.stringify(confirmation.value.err)}`);
    return signature;
  }

  async function onQuote() {
    if (!snapshot) return;
    setError("");
    try {
      const decimals = side === "buy" ? snapshot.quoteDecimals : snapshot.baseDecimals;
      const quoted = await quoteDbcSwap({
        connection,
        poolAddress: address,
        amountIn: rawFromUi(Number(amount), decimals),
        swapBaseForQuote: side === "sell",
        slippageBps: 100,
        partialFill,
      });
      const outDecimals = side === "buy" ? snapshot.baseDecimals : snapshot.quoteDecimals;
      const minimum = quoted.quote.minimumAmountOut?.toString() ?? "0";
      setQuoteText(
        `Output ${formatRaw(quoted.quote.outputAmount.toString(), outDecimals)} · min ${formatRaw(minimum, outDecimals)} · fee ${formatRaw(quoted.quote.tradingFee.toString(), side === "buy" ? snapshot.quoteDecimals : snapshot.baseDecimals)} · left ${quoted.quote.amountLeft.toString()}`,
      );
    } catch (cause) {
      setQuoteText("");
      setError(explainError(cause));
    }
  }

  async function onSwap() {
    if (!snapshot || !publicKey) {
      setError("Connect a wallet before swapping.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const decimals = side === "buy" ? snapshot.quoteDecimals : snapshot.baseDecimals;
      const amountIn = rawFromUi(Number(amount), decimals);
      const quoted = await quoteDbcSwap({
        connection,
        poolAddress: address,
        amountIn,
        swapBaseForQuote: side === "sell",
        slippageBps: 100,
        partialFill,
      });
      const minimum = quoted.quote.minimumAmountOut ?? new BN(0);
      const transaction = await buildDbcSwapTransaction({
        connection,
        owner: publicKey,
        poolAddress: address,
        amountIn,
        minimumAmountOut: minimum,
        swapBaseForQuote: side === "sell",
        partialFill,
      });
      const signature = await signAndSend(transaction, []);
      setStatus(`Swap confirmed: ${signature}`);
      await refresh();
    } catch (cause) {
      setError(explainError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onGraduate() {
    if (!publicKey) {
      setError("Connect a wallet before graduating the pool.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const built = await buildGraduationTransaction({ connection, payer: publicKey, poolAddress: address });
      const signature = await signAndSend(built.transaction, built.signers);
      setStatus(`Graduation confirmed: ${signature}`);
      await refresh();
    } catch (cause) {
      setError(explainError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onDammQuote() {
    if (!snapshot || !damm?.exists) return;
    setError("");
    try {
      const inputMint = side === "buy" ? snapshot.quoteMint : snapshot.baseMint;
      const decimals = side === "buy" ? snapshot.quoteDecimals : snapshot.baseDecimals;
      const quoted = await quoteDammSwap({
        connection,
        poolAddress: snapshot.dammPool,
        inputMint: new PublicKey(inputMint),
        amountIn: rawFromUi(Number(dammAmount), decimals),
        slippagePercent: 1,
      });
      const outDecimals = side === "buy" ? snapshot.baseDecimals : snapshot.quoteDecimals;
      setDammQuote(
        `DAMM v2 output ${formatRaw(quoted.quote.outputAmount.toString(), outDecimals)} · min ${formatRaw(quoted.quote.minimumAmountOut?.toString() ?? "0", outDecimals)} · impact ${quoted.quote.priceImpact.toString()}`,
      );
    } catch (cause) {
      setDammQuote("");
      setError(explainError(cause));
    }
  }

  async function onDammSwap() {
    if (!snapshot || !damm?.exists || !publicKey) {
      setError("Connect a wallet. The DAMM v2 pool also has to exist.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const inputMint = new PublicKey(side === "buy" ? snapshot.quoteMint : snapshot.baseMint);
      const decimals = side === "buy" ? snapshot.quoteDecimals : snapshot.baseDecimals;
      const amountIn = rawFromUi(Number(dammAmount), decimals);
      const quoted = await quoteDammSwap({
        connection,
        poolAddress: snapshot.dammPool,
        inputMint,
        amountIn,
        slippagePercent: 1,
      });
      const transaction = await buildDammSwapTransaction({
        connection,
        payer: publicKey,
        poolAddress: snapshot.dammPool,
        inputMint,
        amountIn,
        minimumAmountOut: quoted.quote.minimumAmountOut ?? new BN(1),
      });
      const signature = await signAndSend(transaction, []);
      setStatus(`DAMM v2 swap confirmed: ${signature}`);
      await refresh();
    } catch (cause) {
      setError(explainError(cause));
    } finally {
      setBusy(false);
    }
  }

  const quoteDecimals = snapshot?.quoteDecimals ?? 9;
  const progress = snapshot ? Math.max(0, Math.min(1, snapshot.progress)) : 0;

  return (
    <div>
      <p className="kicker">{network}</p>
      <h1>Pool desk</h1>
      <p className="lede mono">{address}</p>
      <div className="actions">
        <button className="button-secondary" type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Reading chain…" : "Refresh"}
        </button>
        <a className="button-secondary" href={explorerAccount(address, network)}>Explorer</a>
      </div>
      {error && <p className="status error">{error}</p>}
      {status && (
        <p className="status ok">
          {status}{" "}
          {status.includes("confirmed: ") && (
            <a href={explorerTx(status.split("confirmed: ")[1], network)}>View transaction</a>
          )}
        </p>
      )}
      {!loading && !snapshot && !error && (
        <div className="paper">
          <h2>No DBC pool on this network</h2>
          <p>The header network is {network}. Switch it if this pool was created on the other cluster. StockCurve does not invent a pool that the RPC cannot read.</p>
        </div>
      )}
      {snapshot && (
        <div className="desk">
          <section className="paper">
            <h2>{snapshot.migrated ? "Graduated" : "On the curve"}</h2>
            <div className="bar" aria-label="Quote progress to graduation">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="fine">{percent(progress)} of the migration quote threshold.</p>
            <div className="metric"><span>Quote reserve</span><strong>{formatRaw(snapshot.quoteReserve, quoteDecimals)} / {formatRaw(snapshot.migrationThreshold, quoteDecimals)}</strong></div>
            <div className="metric"><span>Base reserve</span><strong className="mono">{formatRaw(snapshot.baseReserve, snapshot.baseDecimals)}</strong></div>
            <div className="metric"><span>Migration progress</span><strong>{snapshot.migrationProgress}</strong></div>
            <div className="metric"><span>Migrated flag</span><strong>{snapshot.migrated ? "Yes" : "No"}</strong></div>
            <div className="metric"><span>Config</span><a href={explorerAccount(snapshot.configAddress, network)}>{shortKey(snapshot.configAddress, 6)}</a></div>
            <div className="metric"><span>Base mint</span><a href={explorerAccount(snapshot.baseMint, network)}>{shortKey(snapshot.baseMint, 6)}</a></div>
            <div className="metric"><span>Quote mint</span><a href={explorerAccount(snapshot.quoteMint, network)}>{shortKey(snapshot.quoteMint, 6)}</a></div>
            <div className="metric"><span>Creator</span><span className="mono">{shortKey(snapshot.creator, 6)}</span></div>
            <div className="metric"><span>Sqrt price</span><span className="mono">{snapshot.sqrtPrice}</span></div>
            <h3>DBC swap</h3>
            <p className="fine">Quotes use `swapQuote2`. The swap is submitted with `swap2` and 100 bps slippage. Partial fill is for the last buy that would cross graduation.</p>
            <div className="choice-row">
              <button className={side === "buy" ? "active" : ""} type="button" onClick={() => setSide("buy")}>Buy base</button>
              <button className={side === "sell" ? "active" : ""} type="button" onClick={() => setSide("sell")}>Sell base</button>
            </div>
            <div className="field">
              <label htmlFor="amount">Amount in</label>
              <input id="amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <label className="fine">
              <input type="checkbox" checked={partialFill} onChange={(event) => setPartialFill(event.target.checked)} /> Partial fill
            </label>
            <div className="actions">
              <button className="button-secondary" type="button" onClick={() => void onQuote()}>Quote</button>
              <button className="button" type="button" onClick={() => void onSwap()} disabled={busy || snapshot.migrated || !connected}>
                Sign swap
              </button>
            </div>
            {quoteText && <p className="status">{quoteText}</p>}
            {snapshot.migrated && <p className="fine">The DBC pool is migrated. Trade the DAMM v2 pool instead.</p>}
          </section>
          <aside className="paper">
            <h2>DAMM v2</h2>
            <p className="fine">Derived pool {shortKey(snapshot.dammPool, 6)} from config {shortKey(snapshot.dammConfig, 4)}.</p>
            <p>{damm?.exists ? "The graduated pool account is on this network." : "The graduated pool account is not on this network yet."}</p>
            <div className="actions">
              <button className="button moss" type="button" disabled={busy || !snapshot.complete || snapshot.migrated || !connected} onClick={() => void onGraduate()}>
                Graduate to DAMM v2
              </button>
            </div>
            {!snapshot.complete && (
              <p className="fine">
                Graduation stays unsigned until quote reserve reaches {formatRaw(snapshot.migrationThreshold, quoteDecimals)}. On mainnet, Meteora keepers migrate eligible pools at the published thresholds. On devnet, this button is the manual path.
              </p>
            )}
            {damm?.exists && (
              <>
                <div className="metric"><span>Liquidity</span><span className="mono">{damm.liquidity}</span></div>
                <div className="field">
                  <label htmlFor="damm-amount">DAMM amount in</label>
                  <input id="damm-amount" value={dammAmount} onChange={(event) => setDammAmount(event.target.value)} />
                </div>
                <div className="actions">
                  <button className="button-secondary" type="button" onClick={() => void onDammQuote()}>Quote DAMM</button>
                  <button className="button" type="button" onClick={() => void onDammSwap()} disabled={busy || !connected}>Sign DAMM swap</button>
                </div>
                {dammQuote && <p className="status">{dammQuote}</p>}
                <p className="fine">Quote and swap use `CpAmm.getQuote2` and `CpAmm.swap2`.</p>
              </>
            )}
            <p className="fine">
              Raw threshold {snapshot.migrationThreshold}. UI threshold {uiFromRaw(new BN(snapshot.migrationThreshold), quoteDecimals)} quote units.
            </p>
            <a href={explorerAccount(snapshot.dammPool, network)}>Open derived DAMM address</a>
          </aside>
        </div>
      )}
    </div>
  );
}
