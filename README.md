# StockCurve

StockCurve is an equity and RWA-tuned token launchpad on Solana. A listing opens on Meteora's Dynamic Bonding Curve for price discovery, then graduates into a Meteora DAMM v2 pool. Builders can start from a small marketplace of reusable launch configs instead of hand-writing curve parameters.

This project is a public hackathon submission for Meteora's DBC + DAMM v2 track (Superteam / Crypto World's Fair).

## What you can do

- Pick an equity-oriented preset: **Desk Flat**, **Runway Long**, **Listing Exponential**, **Thin Book**, or **Issuer Lock**.
- Preview the curve, graduation threshold, and a pre-pool buy quote computed by `@meteora-ag/dynamic-bonding-curve-sdk`.
- Sign two real transactions: `partner.createConfig`, then `creator.createPool`.
- Quote and swap on the live DBC pool with `swapQuote2` / `swap2`.
- When the quote reserve reaches the migration threshold, sign `migration.migrateToDammV2`.
- After the DAMM v2 account exists, quote and swap it with `@meteora-ag/cp-amm-sdk` (`CpAmm.getQuote2` / `CpAmm.swap2`).
- Browse paid and free presets. Free presets can be used immediately. Paid presets expose their parameters and stay locked behind `PresetAccessProvider`.

Devnet is the default. The same client path targets mainnet when you switch the network and point `NEXT_PUBLIC_MAINNET_RPC_URL` at a mainnet RPC. StockCurve only treats a launch, swap, or graduation as successful after the RPC confirms the signature.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Connect Phantom or Solflare on devnet. Request devnet SOL from https://faucet.solana.com before creating a pool.

Useful checks that do not need a wallet:

```bash
npm run preview-curves
npm run typecheck
npm run build
```

`preview-curves` builds every preset with the DBC SDK, checks that migration is DAMM v2, and quotes a sample buy. `build-config-tx` asks the SDK for an unsigned `createConfig` transaction and checks that it targets the DBC program. Neither script sends a transaction.

## Environment

See `.env.example`. No secrets belong in the repo.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SOLANA_NETWORK` | `devnet` (default) or `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Devnet RPC. The public endpoint is fine for a demo and is rate limited. |
| `NEXT_PUBLIC_MAINNET_RPC_URL` | Mainnet RPC. Use your own provider for anything beyond a read. |
| `PRESET_PAYMENT_WEBHOOK_URL` | Unused placeholder for a future payment backend. |

The header network switch is stored in the browser and selects which of those RPC URLs the wallet adapter uses.

## Architecture

```
app/                  Next.js App Router pages
components/           Desk UI: launch wizard, pool desk, preset browser
lib/meteora/curve.ts  Preset → DBC ConfigParameters, chart prices, pre-pool quotes
lib/meteora/actions.ts  Config, pool, swap, migration, and DAMM v2 transaction builders
lib/marketplace/access.ts  Free-preset gate and the paid-preset extension point
scripts/preview-curves.ts  Offline SDK check for every preset
```

The browser holds the wallet. The app builds unsigned `Transaction`s with the Meteora SDKs, the wallet signs, and the configured RPC submits them. Launch addresses are remembered in `localStorage` so the desk can be reopened. That list is not a chain index. Any DBC pool address can be opened from the Book page.

### Curve presets

| Preset | Builder | Shape | Fee idea |
| --- | --- | --- | --- |
| Desk Flat | `buildCurve` | Single segment, 35% of supply on the curve | 30 bps flat, dynamic fee on |
| Runway Long | `buildCurveWithLiquidityWeights` | Liquidity increases toward the listing price | 80 → 30 bps linear over 24h |
| Listing Exponential | `buildCurveWithTwoSegments` | Low open, higher graduation cap | 250 → 30 bps exponential over 6h |
| Thin Book | `buildCurve` | Wider constant fee for illiquid names | 100 bps flat + dynamic fee |
| Issuer Lock | `buildCurveWithLiquidityWeights` | Long runway, LP fully locked | 60 → 25 bps linear over 12h |
| Prime Book | `buildCurveWithTwoSegments` | Listed at 0.5 SOL, not unlocked here | 40 → 25 bps exponential over 2h |

Shared listing terms:

- Base token is SPL with 6 decimals and a 1,000,000 supply. Five percent is leftover so the SDK's supply rounding check passes.
- Trading fees are collected in the quote token. The issuer receives 40–70% of the trading fee, depending on the preset.
- Migration is `MigrationOption.MET_DAMM_V2` with `MigrationFeeOption.Customizable`.
- Graduated liquidity is 80% permanently locked to the issuer and 20% permanently locked to the config partner. Nothing is returned as unlocked LP.
- Quote token is SOL or USDC. Devnet USDC is Circle's devnet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Mainnet USDC is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

Sandbox profiles use a small graduation threshold so a devnet wallet can finish the curve. Keeper profiles meet or exceed the amounts Meteora's mainnet keepers require: **10 SOL** or **750 USDC**.

## Meteora integration points

Program ids, identical on devnet and mainnet:

- DBC `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`
- DAMM v2 `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
- DBC pool authority `FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM`

| Step | SDK call | Where |
| --- | --- | --- |
| Build curve | `buildCurve`, `buildCurveWithLiquidityWeights`, `buildCurveWithTwoSegments` | `lib/meteora/curve.ts` |
| Pre-pool quote | `DynamicBondingCurveClient.pool.getQuoteFromInputAmount` | launch prospectus |
| Create config | `client.partner.createConfig` | launch wizard, first signature |
| Create pool | `client.creator.createPool` | launch wizard, second signature |
| Pool address | `deriveDbcPoolAddress` | after the mint and config exist |
| Read pool | `client.state.getPool`, `getPoolConfig`, `getPoolQuoteTokenCurveProgress` | pool desk |
| Quote swap | `client.pool.swapQuote2` | pool desk |
| Swap | `client.pool.swap2` | pool desk |
| Graduate | `client.migration.migrateToDammV2` | pool desk, only after the threshold is met |
| DAMM address | `deriveDammV2PoolAddress` + `DAMM_V2_MIGRATION_FEE_ADDRESS[Customizable]` | pool desk |
| DAMM read / swap | `CpAmm.fetchPoolState`, `getQuote2`, `swap2` | pool desk, after the account exists |

`migrateToDammV2` returns the migration transaction plus two position-NFT keypairs. Those keypairs partial-sign locally. The connected wallet pays and signs. The button stays disabled until `quoteReserve >= migrationQuoteThreshold`. On mainnet, Meteora keepers also migrate eligible completed pools, including SOL and USDC at the thresholds above and stock-token quote pairs of at least 750 USD equivalent. Devnet has no keeper, so the desk button is the path there.

References:

- https://docs.meteora.ag/developer-guides/dbc
- https://docs.meteora.ag/developer-guides/damm-v2
- https://github.com/MeteoraAg/dynamic-bonding-curve
- https://github.com/MeteoraAg/damm-v2
- https://github.com/MeteoraAg/dynamic-bonding-curve-sdk
- https://github.com/MeteoraAg/damm-v2-sdk

## Preset marketplace and payment extension

`lib/marketplace/access.ts` exports `PresetAccessProvider`. The shipped provider allows every `access: "free"` preset and refuses `access: "paid"`. Prime Book is the paid example, listed at 0.5 SOL. Selecting it does not transfer SOL and does not unlock the preset.

To charge for a preset, implement `check()` so it returns `{ allowed: true }` only after a payment has actually settled (a verified SOL transfer, an NFT, or a server receipt). `PRESET_PAYMENT_WEBHOOK_URL` is the empty slot for that backend. Do not return `allowed: true` from a local toggle.

## Mainnet path

1. Set `NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta` and a private mainnet RPC.
2. Switch the header to `mainnet-beta`.
3. Choose the **keeper** graduation profile so the threshold is at least 10 SOL or 750 USDC.
4. Use a real metadata URI. `public/token-metadata.json` is a template, not a hosted prospectus.
5. Create the config and pool with the same two transactions. Keepers can migrate a completed, eligible pool. The desk can still build `migrateToDammV2` if you need to send it yourself.
6. Trade the derived DAMM v2 pool once `CpAmm.isPoolExist` is true.

A sandbox threshold on mainnet still creates a real pool. Keepers will not pick it up below their published minimums. The pool desk can migrate it manually after the smaller threshold fills.

## Hackathon notes

- Track: Meteora Dynamic Bonding Curve + DAMM v2, Superteam / Crypto World's Fair.
- The integration is the published TypeScript SDKs, not a reimplementation of the programs and not a stub that pretends a transaction landed.
- Wallet, RPC, and devnet SOL are required for the on-chain demo. The curve preview and `npm run preview-curves` show the SDK math without them.
- If this repository is ever made private, add GitHub user `dannxbt` with Read access.

## Project layout

TypeScript, Next.js App Router, `@solana/web3.js` 1.x, and the wallet adapter. Webpack config in `next.config.ts` stubs Node builtins the Solana packages reference so the browser bundle can load the SDKs.
