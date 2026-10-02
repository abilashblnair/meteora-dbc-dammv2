# Judge checklist

Use this with the 60-second walkthrough at the top of the README.

Live app: https://meteora-dbc-dammv2.vercel.app (devnet by default; connect a devnet wallet with faucet SOL).

On-chain proof: one listing taken from `createConfig` to a locked DAMM v2 pool and traded there, with every transaction linked, in the README's [On-chain proof (devnet)](README.md#on-chain-proof-devnet) section. Graduated DAMM v2 pool: [5cwVNcZw…Pyub](https://explorer.solana.com/address/5cwVNcZwESnBSCyLgZHmuT1GxK46y6FbntzaGAaBPyub?cluster=devnet).

## Depth of Meteora integration

- [ ] Curve preview is produced by `buildCurve` / `buildCurveWithLiquidityWeights` / `buildCurveWithTwoSegments` in `lib/meteora/curve.ts`.
- [ ] Launch signs `partner.createConfig`, then `creator.createPool` (`lib/meteora/actions.ts`).
- [ ] Pool desk quotes with `swapQuote2` and swaps with `swap2`.
- [ ] Graduation stays disabled until `quoteReserve >= migrationQuoteThreshold`, then signs `migration.migrateToDammV2`.
- [ ] After the account exists, DAMM v2 quotes and swaps use `CpAmm.getQuote2` and `CpAmm.swap2`.
- [ ] `npm run preview-curves` and `npm run build-config-tx` pass without a wallet.

## Technical execution

- [ ] A missing pool says the account was not found. It does not invent a fill or a signature.
- [ ] Wallet rejection, low SOL, and RPC rate limits produce a next step, with the raw detail underneath.
- [ ] Prime Book is locked. Judge demo unlock is labeled and states that no SOL was collected.

## Originality and impact

- [ ] Presets are equity books: flat reference price, long runway, exponential listing, thin-book fee, issuer LP lock.
- [ ] Migration is DAMM v2. Graduated liquidity is permanently locked (80% issuer, 20% partner).
- [ ] Mainnet path is the keeper profile at 10 SOL or 750 USDC, documented in the README and `.env.example`.

## If the repository is made private

Add GitHub user `dannxbt` with Read access.
