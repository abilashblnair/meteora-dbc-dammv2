# StockCurve test plan

Three layers: offline SDK checks, an automated devnet lifecycle run, and manual scenarios in the browser with a real wallet. Run them in this order before a release or a submission.

## 1. Offline checks (no wallet, no SOL)

```bash
npm run typecheck
npm run preview-curves
npm run build-config-tx
npm run build
```

| Check | Pass when |
| --- | --- |
| `typecheck` | No TypeScript errors |
| `preview-curves` | Every preset × SOL/USDC × sandbox/keeper builds a DBC config, migrates to DAMM v2, quotes a buy above zero, keeps keeper thresholds at ≥ 10 SOL / 750 USDC, and its curve profile ends at the graduation threshold and price. Paid presets stay locked; the demo unlock says no SOL was collected. |
| `build-config-tx` | Prints an unsigned `createConfig` transaction aimed at the DBC program |
| `build` | Next.js production build succeeds |

## 2. Automated devnet lifecycle (`npm run e2e-devnet`)

Signs with a throwaway devnet keypair stored in `.e2e-keypair.json` (gitignored) and calls the same builders as the site (`lib/meteora/actions.ts`). It needs about 1.6 devnet SOL; if the airdrop fails it prints the address to fund at https://faucet.solana.com.

| Step | Call | Checks |
| --- | --- | --- |
| 1 | `partner.createConfig` (Thin Book, SOL, sandbox, 1 SOL threshold) | confirmed |
| 2 | `creator.createPool` | pool readable, unmigrated, empty reserve, graduation blocked |
| 3 | `swapQuote2` + `swap2` buy 0.2 SOL | quote > 0, wallet receives ≥ quoted minimum |
| 4 | `swap2` sell 25% of the base | sell quote > 0, confirmed |
| 5 | `swap2` partial-fill buys | reserve reaches the threshold, DAMM pool not yet created, graduation gate opens |
| 6 | `migration.migrateToDammV2` | DBC pool flagged migrated, `CpAmm.isPoolExist` true, liquidity > 0, second graduation refused |
| 7 | `CpAmm.getQuote2` + `swap2` buy, then sell | base balance rises, both confirmed |

It prints a devnet explorer link for every signature and saves them to `docs/e2e-devnet-result.json`.

## 3. Manual scenarios in the browser

Use Chrome with Phantom or Solflare set to **devnet** and about 2 devnet SOL. Run against the live app (https://meteora-dbc-dammv2.vercel.app) or `npm run dev`.

Last full run: 2 October 2026 on the live app, Desk Flat / sandbox / SOL. Create config, create pool, curve buys and sells, a partial-fill buy to the threshold, graduation and two DAMM v2 trades all confirmed; every transaction is linked in the README's [On-chain proof (devnet)](../README.md#on-chain-proof-devnet).

### Happy path

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| H1 | Home without a wallet | Open `/` | Hero, live curve chart (hover shows price and SOL raised), 3 steps, 3 preset cards with curve shapes. No console errors. |
| H2 | Connect wallet | Header → **Connect wallet** → pick your wallet → approve | Modal shows "Detected" for installed wallets and the devnet note; button turns into icon, short address and SOL balance |
| H3 | Account menu | Click the connected button | Copy address, View on explorer (devnet), Get devnet SOL, Change wallet, Disconnect all work; Esc and outside click close it |
| H4 | Presets | `/marketplace`, try each filter | Counts update; Prime Book shows **Locked · payment rail required** |
| H5 | Launch wizard | `/launch` → Thin Book → Continue → name/symbol, **SOL**, **Sandbox** → Continue | Summary panel follows each choice; Review shows the curve, price range, "Graduation 1 SOL", fee, locked LP, sample buy in tokens |
| H6 | Create config and pool | **Create config and pool**, approve 2 signatures | Lifecycle: Config ✓ then Pool live ✓; status says confirmed; Config tx / Pool tx / Open pool desk buttons appear |
| H7 | Book | `/launches` | The new pool is listed for devnet; **Open desk** works |
| H8 | Curve buy | Pool desk → Buy → 0.2 → **Get quote** → **Sign buy** | Quote rows show receive / minimum / fee; after confirm the reserve and % rise; status links the transaction |
| H9 | Curve sell | Sell → a small base amount → quote → **Sign sell** | Reserve drops; SOL comes back |
| H10 | Fill to threshold | Buy ~1.1 SOL with **Partial fill** on | Reserve shows ≥ 1 SOL, title "Ready to graduate", graduate card outlined green |
| H11 | Graduate | **Graduate to DAMM v2**, approve | Lifecycle Graduated ✓ and DAMM v2 ✓; DAMM v2 card shows "Live"; curve trading replaced by the migrated notice |
| H12 | DAMM v2 trade | DAMM card → Buy 0.02 → **Get quote** → **Sign DAMM swap** | Quote rows with price impact; swap confirms; base balance rises |

### Guard rails and errors

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| E1 | Reject a signature | Reject `createConfig` in the wallet | Readable error, lifecycle back to idle, nothing saved to the Book |
| E2 | Reject the second signature | Approve config, reject pool | Config stays ✓, error shown, no pool saved |
| E3 | Not enough SOL | Use an empty devnet wallet | "low SOL" message with a next step, raw detail underneath |
| E4 | Wrong network | Header on Mainnet, open a devnet pool | "No DBC pool on mainnet-beta" empty state, no invented data |
| E5 | Invalid address | Book → paste `abc` | "That is not a valid Solana address", **Open desk** disabled |
| E6 | Graduate too early | Pool below threshold | Graduate button disabled; reason explains the threshold |
| E7 | Graduate twice | After H11, reload the desk | Graduate hidden; a second migration is never built |
| E8 | Paid preset | Try Prime Book with the demo switch off | Not selectable; with the switch on it is labeled "Demo unlock. No payment collected." |
| E9 | Swap without wallet | Disconnect, open a pool, **Get quote** | Quote works read-only; sign button says "Connect wallet to trade" |
| E10 | Wallet modal without extensions | Fresh browser profile | Phantom and Solflare show **Install ↗** links; no crash |

### Layout

| # | Width | Expected |
| --- | --- | --- |
| L1 | 375 px (phone) | Two-row header (logo + wallet, nav + Dev/Main); no sideways scroll on any page |
| L2 | 760 px and 980 px | Same two-row header, nothing clipped |
| L3 | 1280 px | One-row header; wizard sidebar sticks while scrolling |

## 4. Mainnet smoke test (before announcing a live listing)

1. Set your own `NEXT_PUBLIC_MAINNET_RPC_URL` in Vercel (the public endpoint rejects browser traffic).
2. Host real token metadata and use its URL in the wizard.
3. Header → **Mainnet**, wizard → **Keeper** profile (≥ 10 SOL or 750 USDC threshold).
4. Run H5–H8 with a small first buy. Graduation is done by Meteora keepers once the keeper threshold fills; the desk button also works.
