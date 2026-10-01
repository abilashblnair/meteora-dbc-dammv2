"use client";

import { CurveChart, priceLabel } from "@/components/CurveChart";
import { useNetwork } from "@/components/Providers";
import { explainError } from "@/lib/errors";
import { explorerTx } from "@/lib/format";
import { freePresetAccess } from "@/lib/marketplace/access";
import { buildConfigTransaction, buildPoolTransaction } from "@/lib/meteora/actions";
import { KEEPER_MIN_QUOTE, quoteMintFor, type NetworkProfile, type QuoteKind } from "@/lib/meteora/constants";
import { previewPreset } from "@/lib/meteora/curve";
import { LAUNCH_PRESETS, getPreset, type LaunchPreset } from "@/lib/meteora/presets";
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

  const preset = getPreset(presetId) ?? LAUNCH_PRESETS[0];
  const access = freePresetAccess.check(preset);
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
    try {
      setStatus("Building the DBC config transaction…");
      const configBuilt = await buildConfigTransaction({
        connection,
        payer: publicKey,
        preset,
        quote,
        profile,
        network,
      });
      setStatus("Waiting for the config signature. The config keypair signs with your wallet.");
      const configSignature = await signAndSend(configBuilt.transaction, configBuilt.signers);
      setStatus(`Config confirmed: ${configSignature}. Building the pool transaction…`);
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
      const poolSignature = await signAndSend(poolBuilt.transaction, poolBuilt.signers);
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
        configSignature,
        poolSignature,
        createdAt: Date.now(),
      });
      setPoolAddress(poolBuilt.pool.toBase58());
      setStatus(`Pool confirmed: ${poolSignature}`);
    } catch (cause) {
      setError(explainError(cause));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wizard">
      <div className="steps-nav">
        {STEPS.map((label, index) => (
          <button key={label} className={index === step ? "active" : ""} type="button" onClick={() => setStep(index)}>
            0{index + 1} {label}
          </button>
        ))}
      </div>
      <div className="paper">
        {step === 0 && (
          <>
            <h2>Choose a book</h2>
            <p>Each preset is compiled with the Meteora curve builders and migrates to DAMM v2.</p>
            <div className="preset-pick">
              {LAUNCH_PRESETS.map((item) => (
                <PresetChoice key={item.id} preset={item} active={item.id === preset.id} onSelect={() => setPresetId(item.id)} />
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2>Listing terms</h2>
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
                <span className="fine">Stored on the mint. Host `public/token-metadata.json` and replace this placeholder before a production listing.</span>
              </div>
            </div>
            <p className="fine">Quote token</p>
            <div className="choice-row">
              {(["SOL", "USDC"] as const).map((item) => (
                <button key={item} className={item === quote ? "active" : ""} type="button" onClick={() => setQuote(item)}>
                  {item}
                </button>
              ))}
            </div>
            <p className="fine">Graduation profile</p>
            <div className="choice-row">
              <button className={profile === "sandbox" ? "active" : ""} type="button" onClick={() => setProfile("sandbox")}>
                Sandbox threshold
              </button>
              <button className={profile === "keeper" ? "active" : ""} type="button" onClick={() => setProfile("keeper")}>
                Keeper threshold
              </button>
            </div>
          </>
        )}
        {step === 2 && preview.value && (
          <>
            <h2>Prospectus</h2>
            <CurveChart
              points={preview.value.points}
              startLabel={priceLabel(preview.value.startPrice, quote)}
              endLabel={priceLabel(preview.value.endPrice, quote)}
            />
            <table className="review-table">
              <tbody>
                <tr><th>Preset</th><td>{preset.name} · {preset.builder}</td></tr>
                <tr><th>Network</th><td>{network}</td></tr>
                <tr><th>Quote</th><td>{quoteMintFor(network, quote).toBase58()}</td></tr>
                <tr><th>Fee</th><td>{preset.feeLabel}. Issuer share of trading fees: {preset.creatorTradingFeePercentage}%.</td></tr>
                <tr><th>Graduation</th><td>{preview.value.migrationQuote} {quote}. DAMM v2 config {preview.value.dammConfig}.</td></tr>
                <tr><th>Liquidity</th><td>80% issuer permanent lock, 20% partner permanent lock. No unlocked LP.</td></tr>
                <tr><th>Sample buy</th><td>{preview.value.sampleBuyAmount} {quote} quotes {preview.value.sampleOutputRaw} base units before the pool exists.</td></tr>
              </tbody>
            </table>
            {keeperGap && <p className="status">{keeperGap}</p>}
            {!access.allowed && <p className="status error">{access.reason}</p>}
          </>
        )}
        {step === 2 && preview.error && <p className="status error">{preview.error}</p>}
        <div className="actions">
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
              {busy ? "Signing…" : "Create config and pool"}
            </button>
          )}
        </div>
        {status && <p className="status ok">{status}</p>}
        {error && <p className="status error">{error}</p>}
        {poolAddress && (
          <p>
            <Link className="button" href={`/pool/${poolAddress}`}>Open pool desk</Link>
          </p>
        )}
        {status.includes("confirmed") && status.includes("Pool") && (
          <p className="fine">
            Config and pool signatures are on-chain.{" "}
            {status.split("Pool confirmed: ")[1] && (
              <a href={explorerTx(status.split("Pool confirmed: ")[1], network)}>View the pool transaction</a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function PresetChoice({
  preset,
  active,
  onSelect,
}: {
  preset: LaunchPreset;
  active: boolean;
  onSelect: () => void;
}) {
  const access = freePresetAccess.check(preset);
  return (
    <button className={active ? "active" : ""} type="button" onClick={onSelect} disabled={!access.allowed}>
      <strong>{preset.name}</strong>
      <div className="fine">{preset.shape} · {preset.feeLabel}</div>
      <div className="fine">{access.allowed ? preset.suitedFor : "Listed preset. Payment provider required."}</div>
    </button>
  );
}
