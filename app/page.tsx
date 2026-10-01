import { CurveChart, priceLabel } from "@/components/CurveChart";
import { DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, KEEPER_MIN_QUOTE } from "@/lib/meteora/constants";
import { previewPreset } from "@/lib/meteora/curve";
import { LAUNCH_PRESETS, getPreset } from "@/lib/meteora/presets";
import Link from "next/link";

export default function HomePage() {
  const preset = getPreset("desk-flat");
  if (!preset) throw new Error("Desk Flat preset is missing.");
  const preview = previewPreset(preset, "SOL", "sandbox");

  return (
    <div>
      <section className="hero">
        <div>
          <p className="kicker">Meteora DBC · DAMM v2</p>
          <h1>A launch desk for tokenized equity.</h1>
          <p className="lede">
            StockCurve opens price discovery on Meteora&apos;s Dynamic Bonding Curve, with fee schedules and curve shapes
            chosen for thin stock-like books, then graduates the pool into DAMM v2 liquidity.
          </p>
          <div className="actions">
            <Link className="button" href="/launch">Launch a token</Link>
            <Link className="button-secondary" href="/marketplace">Browse presets</Link>
          </div>
        </div>
        <div className="paper">
          <p className="kicker" style={{ color: "#8a6420" }}>Desk Flat · sandbox SOL</p>
          <h2>Opening book</h2>
          <CurveChart
            points={preview.points}
            startLabel={priceLabel(preview.startPrice, "SOL")}
            endLabel={priceLabel(preview.endPrice, "SOL")}
          />
          <p className="fine">
            Graduation at {preview.migrationQuote} SOL. A 0.1 SOL simulated buy quotes {preview.sampleOutputRaw} base units
            through the DBC SDK before any pool exists.
          </p>
        </div>
      </section>
      <section className="steps">
        <article className="step">
          <strong>01 · Connect</strong>
          <p>Use Phantom or Solflare on the header network. On devnet, fund the wallet from the Solana faucet and leave SOL for fees.</p>
        </article>
        <article className="step">
          <strong>02 · Pick a book</strong>
          <p>Flat stays near a reference price. Long thickens into the listing. Exponential opens thin, then the fee decays.</p>
        </article>
        <article className="step">
          <strong>03 · Sign, trade, graduate</strong>
          <p>Two confirmed signatures create the DBC pool. Swaps fill the reserve. Graduation signs migrateToDammV2, then DAMM v2 can trade.</p>
        </article>
      </section>
      <section className="stat-row">
        <article className="stat">
          <strong>DBC program</strong>
          <em>{DBC_PROGRAM_ID}</em>
        </article>
        <article className="stat">
          <strong>DAMM v2 program</strong>
          <em>{DAMM_V2_PROGRAM_ID}</em>
        </article>
        <article className="stat">
          <strong>Keeper minimums</strong>
          <em>{KEEPER_MIN_QUOTE.SOL} SOL · {KEEPER_MIN_QUOTE.USDC} USDC</em>
        </article>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">Preset marketplace</p>
            <h2>Books you can reuse</h2>
          </div>
          <Link href="/marketplace">See all</Link>
        </div>
        <div className="card-grid">
          {LAUNCH_PRESETS.slice(0, 3).map((item) => (
            <article className="card" key={item.id}>
              <h3>{item.name}</h3>
              <p>{item.suitedFor}</p>
              <p className="fine mono">{item.feeLabel}</p>
              <Link className="button" href={`/launch?preset=${item.id}`}>Use {item.name}</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
