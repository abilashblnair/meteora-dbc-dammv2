import { CurveChart } from "@/components/CurveChart";
import { Sparkline } from "@/components/Sparkline";
import { DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, KEEPER_MIN_QUOTE } from "@/lib/meteora/constants";
import { formatTokens } from "@/lib/format";
import { BASE_DECIMALS, previewPreset } from "@/lib/meteora/curve";
import { LAUNCH_PRESETS, SHAPE_GUIDE, getPreset } from "@/lib/meteora/presets";
import Link from "next/link";

export default function HomePage() {
  const preset = getPreset("desk-flat");
  if (!preset) throw new Error("Desk Flat preset is missing.");
  const preview = previewPreset(preset, "SOL", "sandbox");
  const featured = ["desk-flat", "runway-long", "listing-exponential"]
    .map((id) => getPreset(id))
    .filter((item) => item !== undefined)
    .map((item) => ({ preset: item, preview: previewPreset(item, "SOL", "sandbox") }));

  return (
    <div>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="dot live" aria-hidden="true" /> Built on Meteora DBC · DAMM v2
          </p>
          <h1>A launch desk for tokenized equity.</h1>
          <p className="lede">
            Open price discovery on Meteora&apos;s Dynamic Bonding Curve with curve shapes and fee schedules sized for thin,
            stock-like books. When the reserve fills, the pool graduates into permanently locked DAMM v2 liquidity.
          </p>
          <div className="actions">
            <Link className="button" href="/launch">Launch a token</Link>
            <Link className="button-secondary" href="/marketplace">Browse presets</Link>
          </div>
          <dl className="hero-facts">
            <div>
              <dt>Curve shapes</dt>
              <dd>Flat · Long · Exponential</dd>
            </div>
            <div>
              <dt>Graduated LP</dt>
              <dd>100% permanently locked</dd>
            </div>
            <div>
              <dt>Keeper path</dt>
              <dd>{KEEPER_MIN_QUOTE.SOL} SOL · {KEEPER_MIN_QUOTE.USDC} USDC</dd>
            </div>
          </dl>
        </div>
        <div className="paper hero-card">
          <div className="card-head">
            <div>
              <p className="kicker ink">Desk Flat · sandbox · SOL</p>
              <h2>Opening book</h2>
            </div>
            <span className="pill">Live SDK preview</span>
          </div>
          <CurveChart profile={preview.profile} quote="SOL" />
          <p className="fine">
            A {preview.sampleBuyAmount} SOL buy quotes {formatTokens(preview.sampleOutputRaw, BASE_DECIMALS)} tokens through{" "}
            <code>getQuoteFromInputAmount</code> before any pool exists.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">How it works</p>
            <h2>Three signatures from listing to DAMM v2</h2>
          </div>
        </div>
        <ol className="steps">
          <li className="step">
            <span className="step-num">01</span>
            <strong>Pick a book</strong>
            <p>Flat holds a reference price. Long thickens into the listing. Exponential opens thin and decays its fee.</p>
          </li>
          <li className="step">
            <span className="step-num">02</span>
            <strong>Sign config and pool</strong>
            <p>
              <code>createConfig</code> then <code>createPool</code>. The listing goes live on the DBC curve and trades with{" "}
              <code>swap2</code>.
            </p>
          </li>
          <li className="step">
            <span className="step-num">03</span>
            <strong>Graduate</strong>
            <p>
              Once the quote reserve hits the threshold, <code>migrateToDammV2</code> moves liquidity into a locked DAMM v2
              pool.
            </p>
          </li>
        </ol>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">Preset marketplace</p>
            <h2>Books you can reuse</h2>
          </div>
          <Link className="text-link" href="/marketplace">All presets →</Link>
        </div>
        <div className="card-grid">
          {featured.map(({ preset: item, preview: itemPreview }) => (
            <article className="card preset-card" key={item.id}>
              <div className="tags">
                <span className="tag shape">{SHAPE_GUIDE[item.shape].title}</span>
                <span className="tag free">Free</span>
              </div>
              <h3>{item.name}</h3>
              <Sparkline profile={itemPreview.profile} label={`${item.name} curve shape`} />
              <p>{item.suitedFor}</p>
              <p className="fine mono">{item.feeLabel}</p>
              <Link className="button-secondary block" href={`/launch?preset=${item.id}`}>Use {item.name}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="program-strip">
          <div>
            <span className="fine">DBC program</span>
            <code>{DBC_PROGRAM_ID}</code>
          </div>
          <div>
            <span className="fine">DAMM v2 program</span>
            <code>{DAMM_V2_PROGRAM_ID}</code>
          </div>
          <div>
            <span className="fine">Presets</span>
            <code>{LAUNCH_PRESETS.length} books · same ids on devnet and mainnet</code>
          </div>
        </div>
      </section>
    </div>
  );
}
