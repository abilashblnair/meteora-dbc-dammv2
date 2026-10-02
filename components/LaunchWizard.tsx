"use client";

import { CurveChart } from "@/components/CurveChart";
import { DemoUnlock, useDemoUnlock } from "@/components/DemoUnlock";
import { Lifecycle } from "@/components/Lifecycle";
import { useNetwork } from "@/components/Providers";
import { explainError } from "@/lib/errors";
import { explorerTx, formatPrice, formatTokens, shortKey } from "@/lib/format";
import { decidePresetAccess } from "@/lib/marketplace/access";
import { buildConfigTransaction, buildPoolTransaction } from "@/lib/meteora/actions";
import { KEEPER_MIN_QUOTE, quoteMintFor, type NetworkProfile, type QuoteKind } from "@/lib/meteora/constants";
import { BASE_DECIMALS, previewPreset } from "@/lib/meteora/curve";
import { LAUNCH_PRESETS, SHAPE_GUIDE, getPreset, type LaunchPreset } from "@/lib/meteora/presets";
import { writeLaunch } from "@/lib/storage";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, type Transaction } from "@solana/web3.js";
import Link from "next/link";
import { useMemo, useState } from "react";

const STEPS = ["Preset", "Terms", "Review"] as const;

export function LaunchWizard({ initialPreset }: { initialPreset?: string }) {
  const { network } = useNetwork();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const starting = getPreset(initialPreset ?? "") ?? LAUNCH_PRESETS[0];
  const [step, setStep] = useState(0);
  const [presetId, setPresetId] = useState(starting.id);
  const [quote, setQuote] = useState<QuoteKind>("SOL");
  const [profile, setProfile] = useState<NetworkProfile>(network === "mainnet-beta" ? "keeper" : "sandbox");
  const [name, setName] = useState("Northwind Common");
  const [symbol, setSymbol] = useState("NWND");
  const [uri, setUri] = useState("https://example.com/stockcurve/northwind.json");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [poolAddress, setPoolAddress] = useState("");
  const [configSignature, setConfigSignature] = useState("");
  const [poolSignature, setPoolSignature] = useState("");
  const [phase, setPhase] = useState<"idle" | "config" | "pool" | "live">("idle");
  const unlock = useDemoUnlock();

  const preset = getPreset(presetId) ?? LAUNCH_PRESETS[0];
  const access = decidePresetAccess(preset, unlock.enabled);
  const preview = useMemo(() => {
    try {
      return { value: previewPreset(preset, quote, profile), error: "" };
    } catch (cause) {
      return { value: null, error: explainError(cause) };
    }
  }, [preset, quote, profile]);

  const keeperGap =
    preview.value && profile === "sandbox" && preview.value.migrationQuote < KEEPER_MIN_QUOTE[quote]
      ? `Sandbox threshold is ${preview.value.migrationQuote} ${quote}. Mainnet keepers migrate SOL at ${KEEPER_MIN_QUOTE.SOL} and USDC at ${KEEPER_MIN_QUOTE.USDC}. Use the keeper profile for that path, or graduate this pool yourself from the pool desk once the sandbox threshold is filled.`
      : "";

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
    if (confirmation.value.err) {
      throw new Error(`RPC confirmed an error: ${JSON.stringify(confirmation.value.err)}`);
    }
    return signature;
  }

  async function launch() {
    setError("");
    setStatus("");
    if (!connected || !publicKey) {
      setError("Connect a wallet on the network selected in the header.");
      return;
    }
    if (!access.allowed) {
      setError(access.reason);
      return;
    }
    if (name.trim().length < 1 || name.trim().length > 32) {
      setError("Token name must be 1–32 characters.");
      return;
    }
    if (!/^[A-Z0-9]{1,10}$/.test(symbol.trim())) {
      setError("Symbol must be 1–10 characters, A–Z and 0–9.");
      return;
    }
    if (!uri.startsWith("https://") || uri.length > 200) {
      setError("Metadata URI must be an https URL of at most 200 characters.");
      return;
    }
    setBusy(true);
    let confirmedConfigSig = "";
    try {
      setPhase("config");
      setStatus("Building the DBC config with partner.createConfig. Approve the first signature in your wallet.");
      const configBuilt = await buildConfigTransaction({
        connection,
        payer: publicKey,
        preset,
        quote,
        profile,
        network,
      });
      setStatus("Waiting for the config signature. The config keypair signs with your wallet.");
      const confirmedConfig = await signAndSend(configBuilt.transaction, configBuilt.signers);
      confirmedConfigSig = confirmedConfig;
      setConfigSignature(confirmedConfig);
      setPhase("pool");
      setStatus("Config signature confirmed. Building the pool with creator.createPool. Approve the second signature.");
      const quoteMint = quoteMintFor(network, quote);
      const poolBuilt = await buildPoolTransaction({
        connection,
        payer: publicKey,
        config: configBuilt.configAddress,
        quoteMint,
        name: name.trim(),
        symbol: symbol.trim(),
        uri: uri.trim(),
      });
      setStatus("Waiting for the pool signature. The new mint keypair signs with your wallet.");
      const confirmedPool = await signAndSend(poolBuilt.transaction, poolBuilt.signers);
      setPoolSignature(confirmedPool);
      setPhase("live");
      writeLaunch({
        network,
        name: name.trim(),
        symbol: symbol.trim(),
        uri: uri.trim(),
        presetId: preset.id,
        profile,
        quote,
        pool: poolBuilt.pool.toBase58(),
        config: configBuilt.configAddress.toBase58(),
        baseMint: poolBuilt.baseMint.toBase58(),
        quoteMint: quoteMint.toBase58(),
        creator: publicKey.toBase58(),
        configSignature: confirmedConfig,
        poolSignature: confirmedPool,
        createdAt: Date.now(),
      });
      setPoolAddress(poolBuilt.pool.toBase58());
      setStatus("Pool signature confirmed. The listing is live on the DBC curve. Graduation and DAMM v2 trading happen on the pool desk after the quote reserve fills.");
    } catch (cause) {
      setError(explainError(cause));
      setStatus("");
      if (!confirmedConfigSig) setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  const stepDone = [true, name.trim().length > 0 && symbol.trim().length > 0, false];

  return (
    <div className="wizard">
      <aside className="wizard-side">
        <ol className="steps-nav">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                className={`${index === step ? "active" : ""} ${index < step && stepDone[index] ? "done" : ""}`}
                type="button"
                onClick={() => setStep(index)}
                disabled={busy || (index > 0 && !access.allowed)}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="steps-num">{index < step && stepDone[index] ? "✓" : index + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <dl className="summary">
          <div><dt>Book</dt><dd>{preset.name}</dd></div>
          <div><dt>Shape</dt><dd>{SHAPE_GUIDE[preset.shape].title}</dd></div>
          <div><dt>Token</dt><dd>{name || "—"} · {symbol || "—"}</dd></div>
          <div><dt>Quote</dt><dd>{quote}</dd></div>
          <div><dt>Profile</dt><dd>{profile === "sandbox" ? "Sandbox" : "Keeper"}</dd></div>
          <div>
            <dt>Graduates at</dt>
            <dd>{preview.value ? `${preview.value.migrationQuote} ${quote}` : "—"}</dd>
          </div>
          <div><dt>Network</dt><dd>{network}</dd></div>
        </dl>
      </aside>
      <div className="paper wizard-main">
        <Lifecycle
          stages={[
            {
              label: "Config",
              state: configSignature ? "done" : phase === "config" ? "current" : "wait",
              detail: configSignature ? "Confirmed" : "createConfig",
            },
            {
              label: "Pool live",
              state: poolSignature ? "done" : phase === "pool" ? "current" : "wait",
              detail: poolSignature ? "Confirmed" : "createPool",
            },
            {
              label: "Reserve",
              state: poolSignature ? "current" : "wait",
              detail: "Fills on the desk",
            },
            {
              label: "Graduated",
              state: "wait",
              detail: "migrateToDammV2",
            },
            {
              label: "DAMM v2",
              state: "wait",
              detail: "CpAmm swap2",
            },
          ]}
        />
        {step === 0 && (
          <>
            <div className="panel-head">
              <h2>Choose a book</h2>
              <p>Flat holds a reference price. Long gives the name a runway. Exponential is an opening print with a fee that starts wide because the book is thin.</p>
            </div>
            <div className="preset-pick" role="radiogroup" aria-label="Preset">
              {LAUNCH_PRESETS.map((item) => (
                <PresetChoice key={item.id} preset={item} active={item.id === preset.id} unlockEnabled={unlock.enabled} onSelect={() => setPresetId(item.id)} />
              ))}
            </div>
            <DemoUnlock enabled={unlock.enabled} forced={unlock.forced} onChange={unlock.setEnabled} />
          </>
        )}
        {step === 1 && (
          <>
            <div className="panel-head">
              <h2>Listing terms</h2>
              <p>The name, symbol and metadata are written to the mint by <code>createPool</code>.</p>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="name">Token name</label>
                <input id="name" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="symbol">Symbol</label>
                <input id="symbol" value={symbol} maxLength={10} onChange={(event) => setSymbol(event.target.value.toUpperCase())} />
              </div>
              <div className="field wide">
                <label htmlFor="uri">Metadata URI</label>
                <input id="uri" value={uri} onChange={(event) => setUri(event.target.value)} />
                <span className="hint">
                  Host your own JSON (see <code>public/token-metadata.json</code>) and replace this placeholder before a production listing.
                </span>
              </div>
            </div>
            <div className="option-group">
              <span className="option-label">Quote token</span>
              <div className="segmented">
                {(["SOL", "USDC"] as const).map((item) => (
                  <button key={item} className={item === quote ? "active" : ""} type="button" onClick={() => setQuote(item)} aria-pressed={item === quote}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <span className="option-label">Graduation profile</span>
              <div className="option-cards">
                <button className={profile === "sandbox" ? "active" : ""} type="button" onClick={() => setProfile("sandbox")} aria-pressed={profile === "sandbox"}>
                  <strong>Sandbox</strong>
                  <span>Small threshold you can fill with faucet SOL. Graduate it yourself from the pool desk.</span>
                </button>
                <button className={profile === "keeper" ? "active" : ""} type="button" onClick={() => setProfile("keeper")} aria-pressed={profile === "keeper"}>
                  <strong>Keeper</strong>
                  <span>At least {KEEPER_MIN_QUOTE.SOL} SOL or {KEEPER_MIN_QUOTE.USDC} USDC, so Meteora keepers migrate it on mainnet.</span>
                </button>
              </div>
            </div>
          </>
        )}
        {step === 2 && preview.value && (
          <>
            <div className="panel-head">
              <h2>Prospectus</h2>
              <p>Everything below is computed by the DBC SDK from the exact config you are about to sign.</p>
            </div>
            <CurveChart profile={preview.value.profile} quote={quote} />
            <dl className="review-list">
              <div><dt>Preset</dt><dd>{preset.name} <span className="mono fine">{preset.builder}</span></dd></div>
              <div><dt>Network</dt><dd>{network}</dd></div>
              <div><dt>Quote mint</dt><dd className="mono">{shortKey(quoteMintFor(network, quote).toBase58(), 6)} ({quote})</dd></div>
              <div><dt>Price range</dt><dd className="mono">{formatPrice(preview.value.startPrice)} → {formatPrice(preview.value.endPrice)} {quote}</dd></div>
              <div><dt>Fee</dt><dd>{preset.feeLabel}. Issuer share of trading fees: {preset.creatorTradingFeePercentage}%.</dd></div>
              <div><dt>Graduation</dt><dd>{preview.value.migrationQuote} {quote} into DAMM v2 <span className="mono fine">{shortKey(preview.value.dammConfig, 4)}</span></dd></div>
              <div><dt>Liquidity</dt><dd>80% issuer and 20% partner, both permanently locked. No unlocked LP.</dd></div>
              <div><dt>Sample buy</dt><dd>{preview.value.sampleBuyAmount} {quote} → {formatTokens(preview.value.sampleOutputRaw, BASE_DECIMALS)} tokens</dd></div>
            </dl>
            {keeperGap && <p className="status">{keeperGap}</p>}
            {!access.allowed && <p className="status error">{access.reason}</p>}
            {access.demoUnlock && <p className="status">{access.reason}</p>}
            {!connected && (
              <p className="status">
                Connect Phantom or Solflare on {network} before signing. Devnet SOL comes from{" "}
                <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>. Leave a little extra for fees.
              </p>
            )}
          </>
        )}
        {step === 2 && preview.error && <p className="status error">{preview.error}</p>}
        <div className="actions wizard-actions">
          {step > 0 && (
            <button className="button-secondary" type="button" onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </button>
          )}
          {step < 2 && (
            <button className="button" type="button" onClick={() => setStep(step + 1)} disabled={!access.allowed && step === 0}>
              Continue
            </button>
          )}
          {step === 2 && (
            <button className="button moss" type="button" onClick={launch} disabled={busy || !access.allowed || !preview.value}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? "Signing…" : "Create config and pool"}
            </button>
          )}
        </div>
        {status && <p className="status ok" aria-live="polite">{status}</p>}
        {error && <p className="status error" aria-live="assertive">{error}</p>}
        {(configSignature || poolSignature || poolAddress) && (
          <div className="tx-links">
            {configSignature && (
              <a className="button-secondary small" href={explorerTx(configSignature, network)} target="_blank" rel="noreferrer">Config tx ↗</a>
            )}
            {poolSignature && (
              <a className="button-secondary small" href={explorerTx(poolSignature, network)} target="_blank" rel="noreferrer">Pool tx ↗</a>
            )}
            {poolAddress && (
              <Link className="button small" href={`/pool/${poolAddress}`}>Open pool desk →</Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PresetChoice({
  preset,
  active,
  unlockEnabled,
  onSelect,
}: {
  preset: LaunchPreset;
  active: boolean;
  unlockEnabled: boolean;
  onSelect: () => void;
}) {
  const access = decidePresetAccess(preset, unlockEnabled);
  const shape = SHAPE_GUIDE[preset.shape];
  return (
    <button
      className={active ? "active" : ""}
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      disabled={!access.allowed}
      title={shape.why}
    >
      <span className="preset-pick-head">
        <strong>{preset.name}</strong>
        <span className={`tag ${preset.access}`}>{preset.access === "free" ? "Free" : access.demoUnlock ? "Demo" : "Locked"}</span>
      </span>
      <span className="fine">{shape.title}. {shape.hint}</span>
      <span className="fine">
        {access.demoUnlock ? "Demo unlock. No payment collected." : access.allowed ? preset.suitedFor : "Listed preset. Payment provider required."}
      </span>
    </button>
  );
}
