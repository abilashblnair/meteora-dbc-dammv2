"use client";

import { Lifecycle } from "@/components/Lifecycle";
import { useNetwork } from "@/components/Providers";
import { SOL_FEE_RESERVE, useTradeBalances } from "@/components/useTradeBalances";
import { useWalletPicker } from "@/components/WalletConnect";
import { explainError } from "@/lib/errors";
import { explorerAccount, explorerTx, formatRaw, percent, shortKey } from "@/lib/format";
import {
  buildDammSwapTransaction,
  buildDbcSwapTransaction,
  buildGraduationTransaction,
  graduationBlockReason,
  loadDammSnapshot,
  loadPoolSnapshot,
  quoteDammSwap,
  quoteDbcSwap,
  type DammSnapshot,
  type PoolSnapshot,
} from "@/lib/meteora/actions";
import { NATIVE_SOL_MINT } from "@/lib/meteora/constants";
import { rawFromUi, uiFromRaw } from "@/lib/meteora/curve";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, type Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { useCallback, useEffect, useState } from "react";

type QuoteRows = { label: string; value: string }[];

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
  const [quoteRows, setQuoteRows] = useState<QuoteRows>([]);
  const [dammAmount, setDammAmount] = useState("0.05");
  const [dammRows, setDammRows] = useState<QuoteRows>([]);
  const [busy, setBusy] = useState(false);
  const { openPicker } = useWalletPicker();
  const balances = useTradeBalances(snapshot?.quoteMint, snapshot?.baseMint);

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
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError("Enter an amount greater than zero. Buys spend the quote token. Sells spend the base token.");
      return;
    }
    try {
      const decimals = side === "buy" ? snapshot.quoteDecimals : snapshot.baseDecimals;
      const quoted = await quoteDbcSwap({
        connection,
        poolAddress: address,
        amountIn: rawFromUi(Number(amount), decimals),
        swapBaseForQuote: side === "sell",
        slippageBps: 100,
        partialFill: partialFillOn,
      });
      const outDecimals = side === "buy" ? snapshot.baseDecimals : snapshot.quoteDecimals;
      const minimum = quoted.quote.minimumAmountOut?.toString() ?? "0";
      setQuoteRows([
        { label: "You receive", value: formatRaw(quoted.quote.outputAmount.toString(), outDecimals) },
        { label: "Minimum (1% slippage)", value: formatRaw(minimum, outDecimals) },
        { label: "Trading fee", value: formatRaw(quoted.quote.tradingFee.toString(), side === "buy" ? snapshot.quoteDecimals : snapshot.baseDecimals, 9) },
        ...(quoted.quote.amountLeft.gtn(0)
          ? [{ label: "Unused, refunded", value: `${formatRaw(quoted.quote.amountLeft.toString(), decimals, 6)} ${side === "buy" ? (snapshot.quoteMint === NATIVE_SOL_MINT ? "SOL" : "USDC") : "tokens"}` }]
          : []),
      ]);
    } catch (cause) {
      setQuoteRows([]);
      setError(explainError(cause));
    }
  }

  async function onSwap() {
    if (!snapshot || !publicKey) {
      setError(`Connect Phantom or Solflare on ${network} before swapping. The quote is free to read. The swap needs a signature.`);
      return;
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError("Enter an amount greater than zero.");
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
        partialFill: partialFillOn,
      });
      const minimum = quoted.quote.minimumAmountOut ?? new BN(0);
      const transaction = await buildDbcSwapTransaction({
        connection,
        owner: publicKey,
        poolAddress: address,
        amountIn,
        minimumAmountOut: minimum,
        swapBaseForQuote: side === "sell",
        partialFill: partialFillOn,
      });
      const signature = await signAndSend(transaction, []);
      setStatus(`Swap confirmed: ${signature}`);
      await Promise.all([refresh(), balances.refresh()]);
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
      await Promise.all([refresh(), balances.refresh()]);
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
      setDammRows([
        { label: "You receive", value: formatRaw(quoted.quote.outputAmount.toString(), outDecimals) },
        { label: "Minimum (1% slippage)", value: formatRaw(quoted.quote.minimumAmountOut?.toString() ?? "0", outDecimals) },
        { label: "Price impact", value: quoted.quote.priceImpact.toString() },
      ]);
    } catch (cause) {
      setDammRows([]);
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
      await Promise.all([refresh(), balances.refresh()]);
    } catch (cause) {
      setError(explainError(cause));
    } finally {
      setBusy(false);
    }
  }

  const quoteDecimals = snapshot?.quoteDecimals ?? 9;
  const progress = snapshot ? Math.max(0, Math.min(1, snapshot.progress)) : 0;
  const graduationReason = snapshot
    ? graduationBlockReason({
        quoteReserve: snapshot.quoteReserve,
        migrationThreshold: snapshot.migrationThreshold,
        migrated: snapshot.migrated,
        dammExists: Boolean(damm?.exists),
      })
    : "Read the pool before graduating.";
  const canGraduate = snapshot ? graduationReason === null && connected && !busy : false;
  const quoteSymbol = snapshot ? (snapshot.quoteMint === NATIVE_SOL_MINT ? "SOL" : "USDC") : "";
  const inputUnit = side === "buy" ? quoteSymbol : "base";
  const isSolQuote = snapshot?.quoteMint === NATIVE_SOL_MINT;
  const sideDecimals = side === "buy" ? quoteDecimals : snapshot?.baseDecimals ?? 6;
  const sideBalance = side === "buy" ? balances.quote : balances.base;
  // "Max" on a SOL buy keeps SOL back for fees and token-account rent.
  const maxSpend = sideBalance && side === "buy" && isSolQuote ? BN.max(sideBalance.sub(SOL_FEE_RESERVE), new BN(0)) : sideBalance;
  const balanceUnit = side === "buy" ? quoteSymbol : "tokens";
  const overBalance = (value: string) => {
    if (!sideBalance || !Number.isFinite(Number(value)) || Number(value) <= 0) return false;
    return rawFromUi(Number(value), sideDecimals).gt(sideBalance);
  };
  // A buy larger than what is left before graduation only goes through in partial-fill mode: exact-in
  // fails with "insufficient liquidity". Switch it on automatically; the unused quote is refunded.
  const remainingToThreshold = snapshot
    ? BN.max(new BN(snapshot.migrationThreshold).sub(new BN(snapshot.quoteReserve)), new BN(0))
    : null;
  const crossesGraduation =
    side === "buy" &&
    remainingToThreshold !== null &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0 &&
    rawFromUi(Number(amount), quoteDecimals).gt(remainingToThreshold);
  const partialFillOn = partialFill || crossesGraduation;
  const balanceProps = {
    connected,
    loading: balances.loading,
    balance: sideBalance,
    decimals: sideDecimals,
    unit: balanceUnit,
    side,
    onConnect: openPicker,
  };
  const statusSignature = status.includes("confirmed: ") ? status.split("confirmed: ")[1] : "";
  const statusLabel = statusSignature ? status.split(":")[0] : status;
  const phaseLabel = !snapshot ? "" : damm?.exists ? "DAMM v2 live" : snapshot.migrated ? "Graduated" : snapshot.complete ? "Ready to graduate" : "On the curve";

  return (
    <div className="pool-desk">
      <div className="desk-head">
        <div>
          <p className="kicker">Pool desk · {network}</p>
          <h1>{phaseLabel || "Pool desk"}</h1>
          <div className="address-row">
            <code>{shortKey(address, 10)}</code>
            <CopyButton value={address} />
            <a className="text-link" href={explorerAccount(address, network)} target="_blank" rel="noreferrer">Explorer ↗</a>
          </div>
        </div>
        <button className="button-secondary" type="button" onClick={() => void refresh()} disabled={loading}>
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? "Reading chain…" : "Refresh"}
        </button>
      </div>
      {error && <p className="status error" aria-live="assertive">{error}</p>}
      {status && (
        <p className="status ok" aria-live="polite">
          {statusLabel}.{" "}
          {statusSignature && (
            <a href={explorerTx(statusSignature, network)} target="_blank" rel="noreferrer">View transaction ↗</a>
          )}
        </p>
      )}
      {loading && !snapshot && !error && (
        <div className="paper empty">
          <span className="spinner large" aria-hidden="true" />
          <h2>Reading the DBC account</h2>
          <p>Asking the RPC for this virtual pool. A missing account stays missing.</p>
        </div>
      )}
      {!loading && !snapshot && !error && (
        <div className="paper empty">
          <h2>No DBC pool on {network}</h2>
          <p>Switch the network in the header if this pool was created on the other cluster. StockCurve does not invent a pool that the RPC cannot read.</p>
        </div>
      )}
      {snapshot && (
        <>
          <section className="paper progress-card">
            <Lifecycle
              stages={[
                { label: "Config", state: "done", detail: "On this pool" },
                { label: "Pool live", state: "done", detail: "DBC virtual pool" },
                { label: "Reserve", state: snapshot.complete ? "done" : "current", detail: percent(progress) },
                {
                  label: "Graduated",
                  state: snapshot.migrated ? "done" : snapshot.complete ? "current" : "wait",
                  detail: snapshot.migrated ? "Migrated" : "migrateToDammV2",
                },
                {
                  label: "DAMM v2",
                  state: damm?.exists ? "done" : snapshot.migrated ? "current" : "wait",
                  detail: damm?.exists ? "Pool found" : "Waiting",
                },
              ]}
            />
            <div className="progress-figures">
              <div>
                <span className="fine">Quote reserve</span>
                <strong className="mono">
                  {formatRaw(snapshot.quoteReserve, quoteDecimals)} <small>/ {formatRaw(snapshot.migrationThreshold, quoteDecimals)} {quoteSymbol}</small>
                </strong>
              </div>
              <div className="progress-pct">
                <span className="fine">To graduation</span>
                <strong className="mono">{percent(progress)}</strong>
              </div>
            </div>
            <div className="bar" role="progressbar" aria-label="Quote progress to graduation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </section>
          <div className="desk">
            <section className="paper trade-card">
              <div className="card-head">
                <h2>Trade the curve</h2>
                <span className="pill mono">swap2</span>
              </div>
              {snapshot.migrated ? (
                <p className="status">The DBC pool has migrated. Trade the DAMM v2 pool instead.</p>
              ) : (
                <>
                  <div className="segmented wide" role="tablist" aria-label="Side">
                    <button className={side === "buy" ? "active buy" : ""} type="button" onClick={() => { setSide("buy"); setQuoteRows([]); }} aria-pressed={side === "buy"}>Buy</button>
                    <button className={side === "sell" ? "active sell" : ""} type="button" onClick={() => { setSide("sell"); setQuoteRows([]); }} aria-pressed={side === "sell"}>Sell</button>
                  </div>
                  <div className="field">
                    <div className="field-head">
                      <label htmlFor="amount">{side === "buy" ? `Spend (${quoteSymbol})` : "Sell (base token)"}</label>
                      <BalanceLine {...balanceProps} onMax={maxSpend ? () => { setAmount(formatRaw(maxSpend.toString(), sideDecimals, sideDecimals)); setQuoteRows([]); } : undefined} />
                    </div>
                    <div className="input-affix">
                      <input id="amount" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setQuoteRows([]); }} />
                      <span>{inputUnit}</span>
                    </div>
                    {connected && overBalance(amount) && <p className="fine field-error">More than your balance.</p>}
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={partialFillOn} disabled={crossesGraduation} onChange={(event) => setPartialFill(event.target.checked)} />
                    <span>
                      Partial fill{" "}
                      <span className="fine">
                        {crossesGraduation && remainingToThreshold
                          ? `on: only ${formatRaw(remainingToThreshold.toString(), quoteDecimals, 6)} ${quoteSymbol} is left before graduation, the rest is refunded`
                          : "for the last buy that would cross graduation"}
                      </span>
                    </span>
                  </label>
                  {quoteRows.length > 0 && <QuoteTable rows={quoteRows} />}
                  <div className="actions">
                    <button className="button-secondary" type="button" onClick={() => void onQuote()}>Get quote</button>
                    <button className={`button ${side === "sell" ? "danger" : "moss"}`} type="button" onClick={() => (connected ? void onSwap() : openPicker())} disabled={busy || (connected && overBalance(amount))} title={connected ? "Signs swap2" : "Connect a wallet first"}>
                      {busy && <span className="spinner" aria-hidden="true" />}
                      {connected ? (side === "buy" ? "Sign buy" : "Sign sell") : "Connect wallet to trade"}
                    </button>
                  </div>
                  <p className="fine">Quotes use <code>swapQuote2</code>; swaps go through <code>swap2</code> with 100 bps slippage.</p>
                </>
              )}
            </section>
            <aside className="desk-side">
              <section className={`paper graduate-card ${canGraduate ? "ready" : ""}`}>
                <div className="card-head">
                  <h2>DAMM v2</h2>
                  <span className={`pill ${damm?.exists ? "ok" : ""}`}>{damm?.exists ? "Live" : snapshot.migrated ? "Migrating" : "Not yet"}</span>
                </div>
                {!damm?.exists && (
                  <>
                    <p>{snapshot.complete ? "The reserve is full. Sign the migration to open the DAMM v2 pool." : "The pool graduates once the quote reserve reaches the threshold."}</p>
                    <button className="button moss block" type="button" disabled={!canGraduate} onClick={() => void onGraduate()} title={graduationReason ?? "Signs migrateToDammV2"}>
                      {busy && canGraduate && <span className="spinner" aria-hidden="true" />}
                      {connected ? "Graduate to DAMM v2" : "Connect wallet to graduate"}
                    </button>
                    {graduationReason && <p className="fine">{graduationReason}</p>}
                  </>
                )}
                {damm?.exists && (
                  <>
                    <div className="segmented wide" role="tablist" aria-label="DAMM side">
                      <button className={side === "buy" ? "active buy" : ""} type="button" onClick={() => { setSide("buy"); setDammRows([]); }}>Buy</button>
                      <button className={side === "sell" ? "active sell" : ""} type="button" onClick={() => { setSide("sell"); setDammRows([]); }}>Sell</button>
                    </div>
                    <div className="field">
                      <div className="field-head">
                        <label htmlFor="damm-amount">{side === "buy" ? `Spend (${quoteSymbol})` : "Sell (base token)"}</label>
                        <BalanceLine {...balanceProps} onMax={maxSpend ? () => { setDammAmount(formatRaw(maxSpend.toString(), sideDecimals, sideDecimals)); setDammRows([]); } : undefined} />
                      </div>
                      <div className="input-affix">
                        <input id="damm-amount" inputMode="decimal" value={dammAmount} onChange={(event) => { setDammAmount(event.target.value); setDammRows([]); }} />
                        <span>{inputUnit}</span>
                      </div>
                      {connected && overBalance(dammAmount) && <p className="fine field-error">More than your balance.</p>}
                    </div>
                    {dammRows.length > 0 && <QuoteTable rows={dammRows} />}
                    <div className="actions">
                      <button className="button-secondary" type="button" onClick={() => void onDammQuote()}>Get quote</button>
                      <button className="button" type="button" onClick={() => (connected ? void onDammSwap() : openPicker())} disabled={busy || (connected && overBalance(dammAmount))}>
                        {busy && <span className="spinner" aria-hidden="true" />}
                        {connected ? "Sign DAMM swap" : "Connect wallet to trade"}
                      </button>
                    </div>
                    <p className="fine">Uses <code>CpAmm.getQuote2</code> and <code>CpAmm.swap2</code>. Liquidity <span className="mono">{damm.liquidity}</span>.</p>
                  </>
                )}
                <a className="text-link" href={explorerAccount(snapshot.dammPool, network)} target="_blank" rel="noreferrer">
                  Derived pool {shortKey(snapshot.dammPool, 4)} ↗
                </a>
              </section>
              <details className="paper details-card">
                <summary>Pool details</summary>
                <dl className="kv">
                  <div><dt>Config</dt><dd><a href={explorerAccount(snapshot.configAddress, network)} target="_blank" rel="noreferrer">{shortKey(snapshot.configAddress, 6)}</a></dd></div>
                  <div><dt>Base mint</dt><dd><a href={explorerAccount(snapshot.baseMint, network)} target="_blank" rel="noreferrer">{shortKey(snapshot.baseMint, 6)}</a></dd></div>
                  <div><dt>Quote mint</dt><dd><a href={explorerAccount(snapshot.quoteMint, network)} target="_blank" rel="noreferrer">{shortKey(snapshot.quoteMint, 6)}</a></dd></div>
                  <div><dt>Creator</dt><dd className="mono">{shortKey(snapshot.creator, 6)}</dd></div>
                  <div><dt>Base reserve</dt><dd className="mono">{formatRaw(snapshot.baseReserve, snapshot.baseDecimals)}</dd></div>
                  <div><dt>Migration progress</dt><dd className="mono">{snapshot.migrationProgress}</dd></div>
                  <div><dt>Migrated flag</dt><dd>{snapshot.migrated ? "Yes" : "No"}</dd></div>
                  <div><dt>DAMM config</dt><dd className="mono">{shortKey(snapshot.dammConfig, 4)}</dd></div>
                  <div><dt>Sqrt price</dt><dd className="mono">{snapshot.sqrtPrice}</dd></div>
                  <div><dt>Raw threshold</dt><dd className="mono">{snapshot.migrationThreshold} ({uiFromRaw(new BN(snapshot.migrationThreshold), quoteDecimals)} {quoteSymbol})</dd></div>
                </dl>
              </details>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function BalanceLine({
  connected,
  loading,
  balance,
  decimals,
  unit,
  side,
  onConnect,
  onMax,
}: {
  connected: boolean;
  loading: boolean;
  balance: BN | null;
  decimals: number;
  unit: string;
  side: "buy" | "sell";
  onConnect: () => void;
  onMax?: () => void;
}) {
  if (!connected) {
    return (
      <button className="balance-line link" type="button" onClick={onConnect}>
        Connect wallet to see your {side === "buy" ? unit : "token"} balance
      </button>
    );
  }
  if (!balance) return <span className="balance-line">{loading ? "Reading balance…" : "Balance unavailable"}</span>;
  return (
    <span className="balance-line">
      Balance <strong className="mono">{formatRaw(balance.toString(), decimals)}</strong> {unit}
      {onMax && balance.gtn(0) && (
        <button className="max-button" type="button" onClick={onMax} title={side === "buy" && unit === "SOL" ? "Keeps 0.01 SOL for fees and rent" : undefined}>
          Max
        </button>
      )}
    </span>
  );
}

function QuoteTable({ rows }: { rows: QuoteRows }) {
  return (
    <dl className="quote-table" aria-live="polite">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd className="mono">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-button small"
      type="button"
      aria-label={copied ? "Copied" : "Copy address"}
      title={copied ? "Copied" : "Copy address"}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      )}
    </button>
  );
}
