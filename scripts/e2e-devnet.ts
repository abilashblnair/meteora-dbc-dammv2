/**
 * End-to-end devnet run of the full StockCurve lifecycle, using the same builders the site calls:
 * createConfig → createPool → swap2 buy → swap2 sell → buys to the threshold → migrateToDammV2 → CpAmm swap2.
 *
 * Signs with a throwaway devnet keypair (never a real wallet). The keypair is kept in `.e2e-keypair.json`
 * (gitignored) so a funded address survives reruns; point E2E_KEYPAIR at another file to use that instead.
 * RPC: E2E_RPC_URL, else NEXT_PUBLIC_SOLANA_RPC_URL from .env.local, else the public devnet endpoint.
 *
 *   npm run e2e-devnet
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildConfigTransaction,
  buildDammSwapTransaction,
  buildDbcSwapTransaction,
  buildGraduationTransaction,
  buildPoolTransaction,
  graduationBlockReason,
  loadDammSnapshot,
  loadPoolSnapshot,
  quoteDammSwap,
  quoteDbcSwap,
} from "../lib/meteora/actions";
import { quoteMintFor } from "../lib/meteora/constants";
import { getPreset } from "../lib/meteora/presets";

const PRESET_ID = process.env.E2E_PRESET ?? "thin-book-usdc";
const KEYPAIR_PATH = process.env.E2E_KEYPAIR ?? ".e2e-keypair.json";
const MIN_BALANCE_SOL = 1.6;

function rpcUrl(): string {
  if (process.env.E2E_RPC_URL) return process.env.E2E_RPC_URL;
  if (existsSync(".env.local")) {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((row) => row.startsWith("NEXT_PUBLIC_SOLANA_RPC_URL="));
    const value = line?.slice("NEXT_PUBLIC_SOLANA_RPC_URL=".length).trim();
    if (value) return value;
  }
  return "https://api.devnet.solana.com";
}

function loadKeypair(): Keypair {
  if (existsSync(KEYPAIR_PATH)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, "utf8")) as number[]));
  }
  const fresh = Keypair.generate();
  writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(fresh.secretKey)));
  return fresh;
}

const tx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
const account = (address: string) => `https://explorer.solana.com/address/${address}?cluster=devnet`;
const sol = (lamports: number) => (lamports / LAMPORTS_PER_SOL).toFixed(4);

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`CHECK FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main() {
  const connection = new Connection(rpcUrl(), "confirmed");
  const payer = loadKeypair();
  const preset = getPreset(PRESET_ID);
  if (!preset) throw new Error(`Unknown preset ${PRESET_ID}`);
  const results: Record<string, string> = {};

  // Same steps as signAndSend in LaunchWizard / PoolDesk, with a local signer in place of the wallet.
  async function send(label: string, transaction: Transaction, signers: Keypair[] = []) {
    const latest = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = payer.publicKey;
    transaction.recentBlockhash = latest.blockhash;
    transaction.sign(payer, ...signers);
    const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 });
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed",
    );
    if (confirmation.value.err) throw new Error(`${label}: RPC confirmed an error ${JSON.stringify(confirmation.value.err)}`);
    results[label] = signature;
    console.log(`  → ${label} confirmed  ${tx(signature)}`);
    return signature;
  }

  console.log(`\nStockCurve devnet E2E · preset ${preset.name} · quote SOL · sandbox`);
  console.log(`Payer ${payer.publicKey.toBase58()}`);

  let balance = await connection.getBalance(payer.publicKey, "confirmed");
  if (balance < MIN_BALANCE_SOL * LAMPORTS_PER_SOL) {
    console.log(`Balance ${sol(balance)} SOL; requesting a devnet airdrop…`);
    try {
      const signature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature, "confirmed");
      balance = await connection.getBalance(payer.publicKey, "confirmed");
    } catch (error) {
      console.log(`Airdrop failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
  if (balance < MIN_BALANCE_SOL * LAMPORTS_PER_SOL) {
    console.log(`\nNeeds at least ${MIN_BALANCE_SOL} devnet SOL; has ${sol(balance)}.`);
    console.log(`Fund ${payer.publicKey.toBase58()} at https://faucet.solana.com (devnet), then rerun.`);
    process.exit(2);
  }
  console.log(`Balance ${sol(balance)} SOL\n`);

  console.log("1. createConfig");
  const config = await buildConfigTransaction({ connection, payer: payer.publicKey, preset, quote: "SOL", profile: "sandbox", network: "devnet" });
  await send("createConfig", config.transaction, config.signers);

  console.log("2. createPool");
  const quoteMint = quoteMintFor("devnet", "SOL");
  const pool = await buildPoolTransaction({
    connection,
    payer: payer.publicKey,
    config: config.configAddress,
    quoteMint,
    name: "StockCurve E2E",
    symbol: "SCE2E",
    uri: "https://meteora-dbc-dammv2.vercel.app/token-metadata.json",
  });
  await send("createPool", pool.transaction, pool.signers);
  const poolAddress = pool.pool.toBase58();
  results.pool = poolAddress;
  results.config = config.configAddress.toBase58();
  results.baseMint = pool.baseMint.toBase58();

  let snap = await loadPoolSnapshot(connection, poolAddress);
  check(snap, "loadPoolSnapshot reads the new pool");
  check(!snap.migrated && snap.quoteReserve === "0", "pool starts unmigrated with an empty quote reserve");
  check(
    graduationBlockReason({ quoteReserve: snap.quoteReserve, migrationThreshold: snap.migrationThreshold, migrated: false, dammExists: false }) !== null,
    "graduation is blocked before the reserve fills",
  );
  const threshold = new BN(snap.migrationThreshold);
  console.log(`  threshold ${sol(threshold.toNumber())} SOL`);

  console.log("3. swap2 buy 0.2 SOL");
  const buyIn = new BN(0.2 * LAMPORTS_PER_SOL);
  const buyQuote = await quoteDbcSwap({ connection, poolAddress, amountIn: buyIn, swapBaseForQuote: false, slippageBps: 100, partialFill: false });
  check(buyQuote.quote.outputAmount.gtn(0), `swapQuote2 quotes ${buyQuote.quote.outputAmount.toString()} base units`);
  await send(
    "buy",
    await buildDbcSwapTransaction({ connection, owner: payer.publicKey, poolAddress, amountIn: buyIn, minimumAmountOut: buyQuote.quote.minimumAmountOut ?? new BN(0), swapBaseForQuote: false, partialFill: false }),
  );
  const baseAta = getAssociatedTokenAddressSync(pool.baseMint, payer.publicKey);
  const held = new BN((await connection.getTokenAccountBalance(baseAta, "confirmed")).value.amount);
  check(held.gte(buyQuote.quote.minimumAmountOut ?? new BN(1)), `wallet received ${held.toString()} base units (≥ quoted minimum)`);

  console.log("4. swap2 sell 25% of the base");
  const sellIn = held.divn(4);
  const sellQuote = await quoteDbcSwap({ connection, poolAddress, amountIn: sellIn, swapBaseForQuote: true, slippageBps: 100, partialFill: false });
  check(sellQuote.quote.outputAmount.gtn(0), `sell quotes ${sol(sellQuote.quote.outputAmount.toNumber())} SOL back`);
  await send(
    "sell",
    await buildDbcSwapTransaction({ connection, owner: payer.publicKey, poolAddress, amountIn: sellIn, minimumAmountOut: sellQuote.quote.minimumAmountOut ?? new BN(0), swapBaseForQuote: true, partialFill: false }),
  );

  console.log("5. buy until the reserve reaches the threshold (partial fill)");
  for (let round = 1; round <= 4; round += 1) {
    snap = await loadPoolSnapshot(connection, poolAddress);
    if (!snap) throw new Error("pool disappeared");
    const remaining = threshold.sub(new BN(snap.quoteReserve));
    console.log(`  reserve ${sol(Number(snap.quoteReserve))} / ${sol(threshold.toNumber())} SOL`);
    if (remaining.lten(0)) break;
    // Overshoot for fees; partial fill refunds whatever crosses the threshold.
    const amountIn = remaining.muln(115).divn(100).add(new BN(0.01 * LAMPORTS_PER_SOL));
    const q = await quoteDbcSwap({ connection, poolAddress, amountIn, swapBaseForQuote: false, slippageBps: 100, partialFill: true });
    await send(
      `fill-${round}`,
      await buildDbcSwapTransaction({ connection, owner: payer.publicKey, poolAddress, amountIn, minimumAmountOut: q.quote.minimumAmountOut ?? new BN(0), swapBaseForQuote: false, partialFill: true }),
    );
  }
  snap = await loadPoolSnapshot(connection, poolAddress);
  if (!snap) throw new Error("pool disappeared");
  check(new BN(snap.quoteReserve).gte(threshold), `reserve ${sol(Number(snap.quoteReserve))} SOL reached the threshold`);
  let damm = await loadDammSnapshot(connection, snap.dammPool);
  check(!damm.exists, "DAMM v2 pool does not exist yet");
  check(
    graduationBlockReason({ quoteReserve: snap.quoteReserve, migrationThreshold: snap.migrationThreshold, migrated: snap.migrated, dammExists: damm.exists }) === null,
    "graduation gate opens",
  );

  console.log("6. migrateToDammV2");
  const grad = await buildGraduationTransaction({ connection, payer: payer.publicKey, poolAddress });
  await send("migrateToDammV2", grad.transaction, grad.signers);
  results.dammPool = grad.dammPool.toBase58();
  snap = await loadPoolSnapshot(connection, poolAddress);
  damm = await loadDammSnapshot(connection, grad.dammPool.toBase58());
  check(snap?.migrated, "DBC pool is flagged migrated");
  check(damm.exists, "CpAmm.isPoolExist is true for the derived DAMM v2 pool");
  check(new BN(damm.liquidity).gtn(0), `DAMM v2 pool holds liquidity ${damm.liquidity}`);
  check(
    graduationBlockReason({ quoteReserve: snap!.quoteReserve, migrationThreshold: snap!.migrationThreshold, migrated: true, dammExists: true }) !== null,
    "a second graduation is refused",
  );

  console.log("7. CpAmm swap2 buy 0.02 SOL, then sell half of it back");
  const dammPool = grad.dammPool.toBase58();
  const before = new BN((await connection.getTokenAccountBalance(baseAta, "confirmed")).value.amount);
  const dIn = new BN(0.02 * LAMPORTS_PER_SOL);
  const dq = await quoteDammSwap({ connection, poolAddress: dammPool, inputMint: quoteMint, amountIn: dIn, slippagePercent: 1 });
  check(dq.quote.outputAmount.gtn(0), `getQuote2 quotes ${dq.quote.outputAmount.toString()} base units`);
  await send(
    "damm-buy",
    await buildDammSwapTransaction({ connection, payer: payer.publicKey, poolAddress: dammPool, inputMint: quoteMint, amountIn: dIn, minimumAmountOut: dq.quote.minimumAmountOut ?? new BN(1) }),
  );
  const after = new BN((await connection.getTokenAccountBalance(baseAta, "confirmed")).value.amount);
  check(after.gt(before), `base balance rose by ${after.sub(before).toString()} units`);
  const back = after.sub(before).divn(2);
  const sq = await quoteDammSwap({ connection, poolAddress: dammPool, inputMint: pool.baseMint, amountIn: back, slippagePercent: 1 });
  await send(
    "damm-sell",
    await buildDammSwapTransaction({ connection, payer: payer.publicKey, poolAddress: dammPool, inputMint: pool.baseMint, amountIn: back, minimumAmountOut: sq.quote.minimumAmountOut ?? new BN(1) }),
  );

  console.log("\nPASS: full lifecycle confirmed on devnet\n");
  for (const [label, value] of Object.entries(results)) {
    const isAddress = ["pool", "config", "baseMint", "dammPool"].includes(label);
    console.log(`${label.padEnd(16)} ${isAddress ? account(value) : tx(value)}`);
  }
  writeFileSync("docs/e2e-devnet-result.json", JSON.stringify({ at: new Date().toISOString(), preset: preset.id, payer: payer.publicKey.toBase58(), ...results }, null, 2));
  console.log("\nSaved docs/e2e-devnet-result.json");
}

main().catch((error) => {
  console.error(`\nFAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
