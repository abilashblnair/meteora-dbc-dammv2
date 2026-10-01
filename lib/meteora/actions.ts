import {
  DynamicBondingCurveClient,
  SwapMode,
  deriveDammV2PoolAddress,
  deriveDbcPoolAddress,
  getCurrentPoint,
  type PoolConfig,
  type VirtualPool,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  ActivationType as AmmActivationType,
  CpAmm,
  SwapMode as AmmSwapMode,
  getCurrentPoint as getAmmCurrentPoint,
  getTokenProgram,
} from "@meteora-ag/cp-amm-sdk";
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, type Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { assertPresetUsable } from "@/lib/marketplace/access";
import {
  quoteMintFor,
  type NetworkProfile,
  type QuoteKind,
  type SolanaNetwork,
} from "@/lib/meteora/constants";
import { buildPresetConfig, dammMigrationConfig, rawFromUi, uiFromRaw } from "@/lib/meteora/curve";
import type { LaunchPreset } from "@/lib/meteora/presets";

export interface BuiltTransaction {
  transaction: Transaction;
  signers: Keypair[];
}

export function dbcClient(connection: Connection): DynamicBondingCurveClient {
  return DynamicBondingCurveClient.create(connection, "confirmed");
}

export async function buildConfigTransaction(input: {
  connection: Connection;
  payer: PublicKey;
  preset: LaunchPreset;
  quote: QuoteKind;
  profile: NetworkProfile;
  network: SolanaNetwork;
}): Promise<BuiltTransaction & { configAddress: PublicKey }> {
  assertPresetUsable(input.preset);
  const client = dbcClient(input.connection);
  const curve = buildPresetConfig(input.preset, input.quote, input.profile);
  const configKeypair = Keypair.generate();
  const transaction = await client.partner.createConfig({
    payer: input.payer,
    config: configKeypair.publicKey,
    feeClaimer: input.payer,
    leftoverReceiver: input.payer,
    quoteMint: quoteMintFor(input.network, input.quote),
    ...curve,
  });
  return { transaction, signers: [configKeypair], configAddress: configKeypair.publicKey };
}

export async function buildPoolTransaction(input: {
  connection: Connection;
  payer: PublicKey;
  config: PublicKey;
  quoteMint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): Promise<BuiltTransaction & { baseMint: PublicKey; pool: PublicKey }> {
  const client = dbcClient(input.connection);
  const baseMint = Keypair.generate();
  const transaction = await client.creator.createPool({
    baseMint: baseMint.publicKey,
    config: input.config,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    payer: input.payer,
    poolCreator: input.payer,
  });
  const pool = deriveDbcPoolAddress(input.quoteMint, baseMint.publicKey, input.config);
  return { transaction, signers: [baseMint], baseMint: baseMint.publicKey, pool };
}

const MIGRATION_PROGRESS = ["Pre-bonding curve", "Post-bonding curve", "Locked vesting", "DAMM pool created"] as const;

export interface PoolSnapshot {
  address: string;
  configAddress: string;
  baseMint: string;
  quoteMint: string;
  creator: string;
  quoteReserve: string;
  baseReserve: string;
  migrationThreshold: string;
  progress: number;
  complete: boolean;
  migrated: boolean;
  migrationProgress: string;
  sqrtPrice: string;
  activationType: number;
  migrationFeeOption: number;
  baseDecimals: number;
  quoteDecimals: number;
  dammPool: string;
  dammConfig: string;
}

function poolStateOf(pool: VirtualPool) {
  return pool.poolState;
}

async function readMintDecimals(connection: Connection, mint: PublicKey): Promise<number> {
  try {
    return (await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID)).decimals;
  } catch {
    return (await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID)).decimals;
  }
}

export async function loadPoolSnapshot(connection: Connection, address: string): Promise<PoolSnapshot | null> {
  let poolKey: PublicKey;
  try {
    poolKey = new PublicKey(address);
  } catch {
    throw new Error("That string is not a Solana address.");
  }
  const client = dbcClient(connection);
  let pool: VirtualPool | null;
  try {
    pool = await client.state.getPool(poolKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/discriminator|not found|does not exist|offset/i.test(message)) return null;
    throw error;
  }
  if (!pool) return null;
  const state = poolStateOf(pool);
  const config = await client.state.getPoolConfig(state.config);
  if (!config) throw new Error("The pool exists, but its config account could not be read.");
  const progress = await client.state.getPoolQuoteTokenCurveProgress(address);
  const dammConfig = dammMigrationConfig();
  const dammPool = deriveDammV2PoolAddress(dammConfig, state.baseMint, config.quoteMint);
  const [baseDecimals, quoteDecimals] = await Promise.all([
    readMintDecimals(connection, state.baseMint),
    readMintDecimals(connection, config.quoteMint),
  ]);
  const progressIndex = state.migrationProgress;
  return {
    address,
    configAddress: state.config.toBase58(),
    baseMint: state.baseMint.toBase58(),
    quoteMint: config.quoteMint.toBase58(),
    creator: state.creator.toBase58(),
    quoteReserve: state.quoteReserve.toString(),
    baseReserve: state.baseReserve.toString(),
    migrationThreshold: config.migrationQuoteThreshold.toString(),
    progress,
    complete: state.quoteReserve.gte(config.migrationQuoteThreshold),
    migrated: state.isMigrated === 1,
    migrationProgress: MIGRATION_PROGRESS[progressIndex] ?? `Program value ${progressIndex}`,
    sqrtPrice: state.sqrtPrice.toString(),
    activationType: config.activationType,
    migrationFeeOption: config.migrationFeeOption,
    baseDecimals,
    quoteDecimals,
    dammPool: dammPool.toBase58(),
    dammConfig: dammConfig.toBase58(),
  };
}

export async function quoteDbcSwap(input: {
  connection: Connection;
  poolAddress: string;
  amountIn: BN;
  swapBaseForQuote: boolean;
  slippageBps: number;
  partialFill: boolean;
}) {
  const client = dbcClient(input.connection);
  const pool = await client.state.getPool(input.poolAddress);
  if (!pool) throw new Error("DBC pool not found on this network.");
  const config = await client.state.getPoolConfig(pool.poolState.config);
  if (!config) throw new Error("Pool config not found.");
  const currentPoint = await getCurrentPoint(input.connection, config.activationType);
  const mode = input.partialFill ? SwapMode.PartialFill : SwapMode.ExactIn;
  const quote = client.pool.swapQuote2({
    virtualPool: pool,
    config: config as PoolConfig,
    swapBaseForQuote: input.swapBaseForQuote,
    swapMode: mode,
    amountIn: input.amountIn,
    slippageBps: input.slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
  });
  return { quote, pool, config, mode };
}

export async function buildDbcSwapTransaction(input: {
  connection: Connection;
  owner: PublicKey;
  poolAddress: string;
  amountIn: BN;
  minimumAmountOut: BN;
  swapBaseForQuote: boolean;
  partialFill: boolean;
}): Promise<Transaction> {
  const client = dbcClient(input.connection);
  const mode = input.partialFill ? SwapMode.PartialFill : SwapMode.ExactIn;
  return client.pool.swap2({
    owner: input.owner,
    payer: input.owner,
    pool: new PublicKey(input.poolAddress),
    swapBaseForQuote: input.swapBaseForQuote,
    swapMode: mode,
    amountIn: input.amountIn,
    minimumAmountOut: input.minimumAmountOut,
    referralTokenAccount: null,
  });
}

export async function buildGraduationTransaction(input: {
  connection: Connection;
  payer: PublicKey;
  poolAddress: string;
}): Promise<BuiltTransaction & { dammPool: PublicKey }> {
  const snapshot = await loadPoolSnapshot(input.connection, input.poolAddress);
  if (!snapshot) throw new Error("DBC pool not found on this network.");
  if (snapshot.migrated) throw new Error("This pool is already marked migrated.");
  if (!snapshot.complete) {
    throw new Error(
      "The bonding curve has not reached its migration quote threshold, so StockCurve will not submit a graduation transaction.",
    );
  }
  const client = dbcClient(input.connection);
  const dammConfig = dammMigrationConfig();
  const response = await client.migration.migrateToDammV2({
    payer: input.payer,
    pool: new PublicKey(input.poolAddress),
    dammConfig,
  });
  return {
    transaction: response.transaction,
    signers: [response.firstPositionNftKeypair, response.secondPositionNftKeypair],
    dammPool: new PublicKey(snapshot.dammPool),
  };
}

export interface DammSnapshot {
  address: string;
  exists: boolean;
  tokenAMint: string;
  tokenBMint: string;
  tokenADecimals: number;
  tokenBDecimals: number;
  sqrtPrice: string;
  liquidity: string;
  activationType: number;
}

export async function loadDammSnapshot(connection: Connection, address: string): Promise<DammSnapshot> {
  const cpAmm = new CpAmm(connection);
  const pool = new PublicKey(address);
  const exists = await cpAmm.isPoolExist(pool);
  if (!exists) {
    return {
      address,
      exists: false,
      tokenAMint: "",
      tokenBMint: "",
      tokenADecimals: 0,
      tokenBDecimals: 0,
      sqrtPrice: "0",
      liquidity: "0",
      activationType: 0,
    };
  }
  const state = await cpAmm.fetchPoolState(pool);
  const [mintA, mintB] = await Promise.all([
    getMint(connection, state.tokenAMint, "confirmed", getTokenProgram(state.tokenAFlag)),
    getMint(connection, state.tokenBMint, "confirmed", getTokenProgram(state.tokenBFlag)),
  ]);
  return {
    address,
    exists: true,
    tokenAMint: state.tokenAMint.toBase58(),
    tokenBMint: state.tokenBMint.toBase58(),
    tokenADecimals: mintA.decimals,
    tokenBDecimals: mintB.decimals,
    sqrtPrice: state.sqrtPrice.toString(),
    liquidity: state.liquidity.toString(),
    activationType: state.activationType,
  };
}

export async function quoteDammSwap(input: {
  connection: Connection;
  poolAddress: string;
  inputMint: PublicKey;
  amountIn: BN;
  slippagePercent: number;
}) {
  const cpAmm = new CpAmm(input.connection);
  const pool = new PublicKey(input.poolAddress);
  const poolState = await cpAmm.fetchPoolState(pool);
  const currentPoint = await getAmmCurrentPoint(
    input.connection,
    poolState.activationType as AmmActivationType,
  );
  const [mintA, mintB] = await Promise.all([
    getMint(input.connection, poolState.tokenAMint, "confirmed", getTokenProgram(poolState.tokenAFlag)),
    getMint(input.connection, poolState.tokenBMint, "confirmed", getTokenProgram(poolState.tokenBFlag)),
  ]);
  const quote = cpAmm.getQuote2({
    inputTokenMint: input.inputMint,
    poolState,
    currentPoint,
    amountIn: input.amountIn,
    slippage: input.slippagePercent,
    swapMode: AmmSwapMode.ExactIn,
    tokenADecimal: mintA.decimals,
    tokenBDecimal: mintB.decimals,
    hasReferral: false,
  });
  return { quote, poolState };
}

export async function buildDammSwapTransaction(input: {
  connection: Connection;
  payer: PublicKey;
  poolAddress: string;
  inputMint: PublicKey;
  amountIn: BN;
  minimumAmountOut: BN;
}): Promise<Transaction> {
  const cpAmm = new CpAmm(input.connection);
  const pool = new PublicKey(input.poolAddress);
  const poolState = await cpAmm.fetchPoolState(pool);
  const outputMint = input.inputMint.equals(poolState.tokenAMint)
    ? poolState.tokenBMint
    : poolState.tokenAMint;
  return cpAmm.swap2({
    payer: input.payer,
    pool,
    inputTokenMint: input.inputMint,
    outputTokenMint: outputMint,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: getTokenProgram(poolState.tokenAFlag),
    tokenBProgram: getTokenProgram(poolState.tokenBFlag),
    referralTokenAccount: null,
    poolState,
    swapMode: AmmSwapMode.ExactIn,
    amountIn: input.amountIn,
    minimumAmountOut: input.minimumAmountOut,
  });
}

export function thresholdUi(raw: string, decimals: number): number {
  return uiFromRaw(new BN(raw), decimals);
}
