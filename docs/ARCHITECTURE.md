# StockCurve architecture

How StockCurve turns a preset into a Meteora DBC pool and graduates it into Meteora DAMM v2. Every diagram below matches the code in `lib/meteora/` and `components/`.

- [System architecture](#system-architecture)
- [User flow](#user-flow)
- [Pool lifecycle](#pool-lifecycle)
- [Sequence: launch](#sequence-launch-createconfig--createpool)
- [Sequence: trade the curve](#sequence-trade-the-curve)
- [Sequence: graduate](#sequence-graduate-to-damm-v2)
- [Sequence: trade DAMM v2](#sequence-trade-damm-v2)
- [Where the code lives](#where-the-code-lives)

## System architecture

StockCurve has no backend that holds keys or funds. The browser builds every transaction with Meteora's SDKs, the user's wallet signs, and the signed transaction goes straight to a Solana RPC. All on-chain state lives in Meteora's programs.

```mermaid
flowchart LR
  subgraph Browser["Browser (Next.js on Vercel)"]
    UI["Pages<br/>Home · Presets · Launch · Book · Pool desk"]
    Presets["lib/meteora/presets.ts<br/>6 equity books"]
    Curve["lib/meteora/curve.ts<br/>preset → DBC config, previews"]
    Actions["lib/meteora/actions.ts<br/>config, pool, swap, graduation, DAMM v2"]
    Access["lib/marketplace/access.ts<br/>free / paid preset gate"]
    Store["localStorage<br/>confirmed launches"]
    UI --> Presets --> Curve
    UI --> Access
    UI --> Actions
    UI --> Store
  end
  subgraph SDKs["Meteora SDKs (in the bundle)"]
    DBCSDK["@meteora-ag/dynamic-bonding-curve-sdk"]
    CPSDK["@meteora-ag/cp-amm-sdk"]
  end
  Wallet["Wallet<br/>Phantom · Solflare"]
  RPC["Solana RPC<br/>devnet · mainnet-beta"]
  subgraph Chain["Solana"]
    DBC["DBC program<br/>dbcij3LW…uSMaqN"]
    DAMM["DAMM v2 program<br/>cpamdpZC…mEn1sGG"]
  end
  Curve --> DBCSDK
  Actions --> DBCSDK
  Actions --> CPSDK
  Actions -- "unsigned tx" --> Wallet
  Wallet -- "signed tx" --> RPC
  Actions -- "reads + confirms" --> RPC
  RPC --> DBC
  RPC --> DAMM
  DBC -- "migrateToDammV2" --> DAMM
```

Design choices:

- **No custom program.** StockCurve composes Meteora's audited programs instead of deploying its own, so there is nothing extra to audit and no upgrade key.
- **No server signer.** New keypairs (the config account, the base mint, and the two DAMM v2 position NFTs) are generated in the browser and partial-sign locally; the connected wallet pays and signs.
- **Confirmed means confirmed.** The UI marks a step done only after `confirmTransaction` returns without an error. Launches are saved to `localStorage` only after both launch signatures confirm.
- **Same ids on both clusters.** DBC and DAMM v2 use the same program ids on devnet and mainnet; the header switch only changes the RPC and the quote mints.

## User flow

```mermaid
flowchart TD
  A([Open StockCurve]) --> B{Wallet connected?}
  B -- no --> C[Connect wallet<br/>pick Phantom / Solflare<br/>on the header network]
  C --> D
  B -- yes --> D[Presets: compare Flat · Long · Exponential books]
  D --> E{Paid preset?}
  E -- "yes, no payment rail" --> F[Locked<br/>judge demo unlock is labeled<br/>and collects no SOL]
  E -- free --> G[Launch wizard]
  F -. demo unlock .-> G
  G --> G1[1 · Preset]
  G1 --> G2[2 · Terms<br/>name, symbol, metadata URI,<br/>SOL or USDC, sandbox or keeper]
  G2 --> G3[3 · Review<br/>SDK curve + pre-pool quote]
  G3 --> H[Sign createConfig]
  H --> I[Sign createPool]
  I --> J[Pool desk]
  J --> K[Quote + sign swap2]
  K --> L{quote reserve ≥ threshold?}
  L -- no --> K
  L -- yes --> M[Sign migrateToDammV2<br/>or a mainnet keeper migrates it]
  M --> N[DAMM v2 live]
  N --> O[Quote + sign CpAmm swap2]
```

## Pool lifecycle

The five stages the app shows in its lifecycle tracker, and what moves a pool between them.

```mermaid
stateDiagram-v2
  [*] --> Config: createConfig confirmed
  Config --> PoolLive: createPool confirmed
  PoolLive --> Filling: first swap2
  Filling --> Filling: swap2 (buy or sell)
  Filling --> ReadyToGraduate: quoteReserve ≥ migrationQuoteThreshold
  ReadyToGraduate --> Graduated: migrateToDammV2 confirmed
  Graduated --> DammLive: CpAmm.isPoolExist = true
  DammLive --> DammLive: CpAmm swap2
  DammLive --> [*]
```

`graduationBlockReason` in `lib/meteora/actions.ts` decides whether the **Graduate** button is enabled: the pool must exist, must not be migrated already, the DAMM v2 pool must not exist yet, and the quote reserve must have reached the threshold.

## Sequence: launch (createConfig → createPool)

```mermaid
sequenceDiagram
  autonumber
  actor Issuer
  participant UI as Launch wizard
  participant SDK as DBC SDK
  participant W as Wallet
  participant RPC as Solana RPC
  participant DBC as DBC program

  Issuer->>UI: Pick preset, quote token, profile
  UI->>SDK: buildCurve* (preset → ConfigParameters)
  UI->>SDK: getQuoteFromInputAmount (sample buy, no pool yet)
  SDK-->>UI: curve profile + quote for the prospectus
  Issuer->>UI: Create config and pool
  UI->>UI: Keypair.generate() for the config
  UI->>SDK: partner.createConfig(feeClaimer = wallet)
  SDK-->>UI: unsigned transaction
  UI->>W: partialSign(config) + sendTransaction
  W->>RPC: signed createConfig
  RPC->>DBC: create config account
  UI->>RPC: confirmTransaction
  RPC-->>UI: confirmed
  UI->>UI: Keypair.generate() for the base mint
  UI->>SDK: creator.createPool(name, symbol, uri)
  UI->>W: partialSign(mint) + sendTransaction
  W->>RPC: signed createPool
  RPC->>DBC: create mint + virtual pool
  UI->>RPC: confirmTransaction
  RPC-->>UI: confirmed
  UI->>UI: deriveDbcPoolAddress, save launch to localStorage
  UI-->>Issuer: Open pool desk
```

## Sequence: trade the curve

```mermaid
sequenceDiagram
  autonumber
  actor Trader
  participant Desk as Pool desk
  participant SDK as DBC SDK
  participant W as Wallet
  participant RPC as Solana RPC
  participant DBC as DBC program

  Desk->>SDK: state.getPool, getPoolConfig, getPoolQuoteTokenCurveProgress
  SDK->>RPC: read accounts
  RPC-->>Desk: reserves, threshold, progress
  Trader->>Desk: Get quote (buy or sell, amount)
  Desk->>SDK: pool.swapQuote2 (100 bps slippage)
  SDK-->>Desk: output, minimum out, fee
  Trader->>Desk: Sign buy / sell
  Desk->>SDK: swapQuote2 again, then pool.swap2(minimumAmountOut)
  Desk->>W: sendTransaction
  W->>RPC: signed swap2
  RPC->>DBC: swap on the curve
  Desk->>RPC: confirmTransaction
  RPC-->>Desk: confirmed
  Desk->>SDK: re-read pool (progress updates)
```

## Sequence: graduate to DAMM v2

```mermaid
sequenceDiagram
  autonumber
  actor Anyone as Issuer or trader
  participant Desk as Pool desk
  participant SDK as DBC SDK
  participant W as Wallet
  participant RPC as Solana RPC
  participant DBC as DBC program
  participant DAMM as DAMM v2 program

  Desk->>Desk: graduationBlockReason(reserve, threshold, migrated, dammExists)
  alt reserve below threshold or already migrated
    Desk-->>Anyone: button disabled, reason shown
  else ready
    Anyone->>Desk: Graduate to DAMM v2
    Desk->>SDK: migration.migrateToDammV2(payer, pool, dammConfig)
    SDK-->>Desk: transaction + 2 position NFT keypairs
    Desk->>W: partialSign(NFT keypairs) + sendTransaction
    W->>RPC: signed migrateToDammV2
    RPC->>DBC: mark the curve migrated, release reserves
    DBC->>DAMM: create pool, lock 80% issuer / 20% partner LP
    Desk->>RPC: confirmTransaction
    RPC-->>Desk: confirmed
    Desk->>RPC: CpAmm.isPoolExist(deriveDammV2PoolAddress)
    RPC-->>Desk: true → DAMM v2 trading unlocks
  end
  Note over DBC,DAMM: On mainnet with the keeper profile (≥ 10 SOL or ≥ 750 USDC),<br/>Meteora keepers can run this migration without the desk.
```

## Sequence: trade DAMM v2

```mermaid
sequenceDiagram
  autonumber
  actor Trader
  participant Desk as Pool desk
  participant CP as cp-amm SDK
  participant W as Wallet
  participant RPC as Solana RPC
  participant DAMM as DAMM v2 program

  Desk->>CP: isPoolExist, fetchPoolState
  CP->>RPC: read pool
  Trader->>Desk: Get quote
  Desk->>CP: getQuote2 (1% slippage)
  CP-->>Desk: output, minimum out, price impact
  Trader->>Desk: Sign DAMM swap
  Desk->>CP: swap2(minimumAmountOut)
  Desk->>W: sendTransaction
  W->>RPC: signed swap
  RPC->>DAMM: swap
  Desk->>RPC: confirmTransaction
  RPC-->>Desk: confirmed
```

## Where the code lives

| Concern | File |
| --- | --- |
| Preset definitions (shape, fees, LP lock, price) | `lib/meteora/presets.ts` |
| Preset → `ConfigParameters`, curve profile, pre-pool quote | `lib/meteora/curve.ts` |
| Every transaction builder and chain read | `lib/meteora/actions.ts` |
| Paid-preset gate | `lib/marketplace/access.ts` |
| Wallet button, picker and account menu | `components/WalletConnect.tsx` |
| Network switch and Solana providers | `components/Providers.tsx` |
| Launch wizard | `components/LaunchWizard.tsx` |
| Pool desk (curve swaps, graduation, DAMM v2) | `components/PoolDesk.tsx` |
| Price vs. raised chart | `components/CurveChart.tsx` |
| Offline SDK checks | `scripts/preview-curves.ts`, `scripts/build-config-tx.ts` |
