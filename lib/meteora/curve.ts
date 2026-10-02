import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DammV2BaseFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  MigrationOption,
  SwapMode,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
  buildCurveWithLiquidityWeights,
  buildCurveWithTwoSegments,
  getMigrationThresholdPrice,
  getPriceFromSqrtPrice,
  type ConfigParameters,
  type SwapQuote2Result,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { NetworkProfile, QuoteKind } from "./constants";
import { quoteDecimals } from "./constants";
import type { LaunchPreset } from "./presets";

export const BASE_DECIMALS = TokenDecimal.SIX;

export interface CurvePoint {
  price: number;
  liquidity: string;
}

/** One sample on the curve: price after `raised` quote tokens have been bought in. */
export interface ProfilePoint {
  raised: number;
  price: number;
}

export interface CurvePreview {
  config: ConfigParameters;
  points: CurvePoint[];
  profile: ProfilePoint[];
  startPrice: number;
  endPrice: number;
  migrationQuote: number;
  migrationQuoteRaw: string;
  sampleBuyQuote: number;
  sampleBuyAmount: number;
  sampleOutputRaw: string;
  dammConfig: string;
}

function feeMode(
  preset: LaunchPreset,
): BaseFeeMode.FeeSchedulerLinear | BaseFeeMode.FeeSchedulerExponential {
  if (preset.feeMode === "exponential") return BaseFeeMode.FeeSchedulerExponential;
  return BaseFeeMode.FeeSchedulerLinear;
}

function baseParams(preset: LaunchPreset, quote: QuoteKind) {
  return {
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: BASE_DECIMALS,
      tokenQuoteDecimal: quoteDecimals(quote),
      tokenAuthorityOption:
        preset.authority === "immutable"
          ? TokenAuthorityOption.Immutable
          : TokenAuthorityOption.CreatorUpdateAuthority,
      totalTokenSupply: preset.totalSupply,
      // Rounding between the requested supply and the curve's dynamic supply
      // must fit inside the leftover. Zero leftover fails the SDK check.
      leftover: Math.max(1_000, Math.floor(preset.totalSupply * 0.05)),
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: feeMode(preset),
        feeSchedulerParam: {
          startingFeeBps: preset.startingFeeBps,
          endingFeeBps: preset.endingFeeBps,
          numberOfPeriod: preset.feeMode === "flat" ? 0 : preset.feePeriods,
          totalDuration: preset.feeMode === "flat" ? 0 : preset.feeDurationSeconds,
        },
      },
      dynamicFeeEnabled: preset.dynamicFee,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: preset.creatorTradingFeePercentage,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: preset.enableFirstSwapWithMinFee,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: preset.migratedDynamicFee
          ? DammV2DynamicFeeMode.Enabled
          : DammV2DynamicFeeMode.Disabled,
        poolFeeBps: preset.migratedPoolFeeBps,
        baseFeeMode:
          preset.feeMode === "exponential"
            ? DammV2BaseFeeMode.FeeTimeSchedulerExponential
            : DammV2BaseFeeMode.FeeTimeSchedulerLinear,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: preset.liquidity.partnerPct,
      partnerPermanentLockedLiquidityPercentage: preset.liquidity.partnerLockedPct,
      creatorLiquidityPercentage: preset.liquidity.creatorPct,
      creatorPermanentLockedLiquidityPercentage: preset.liquidity.creatorLockedPct,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
  };
}

export function buildPresetConfig(
  preset: LaunchPreset,
  quote: QuoteKind,
  profile: NetworkProfile,
): ConfigParameters {
  const numbers = preset.profiles[profile][quote];
  const shared = baseParams(preset, quote);

  if (preset.builder === "buildCurve") {
    if (numbers.migrationQuote === undefined || preset.percentageSupplyOnMigration === undefined) {
      throw new Error(`Preset ${preset.id} is missing flat-curve parameters.`);
    }
    return buildCurve({
      ...shared,
      percentageSupplyOnMigration: preset.percentageSupplyOnMigration,
      migrationQuoteThreshold: numbers.migrationQuote,
    });
  }

  if (preset.builder === "buildCurveWithLiquidityWeights") {
    if (
      numbers.initialMarketCap === undefined ||
      numbers.migrationMarketCap === undefined ||
      !preset.liquidityWeights
    ) {
      throw new Error(`Preset ${preset.id} is missing liquidity-weight parameters.`);
    }
    return buildCurveWithLiquidityWeights({
      ...shared,
      initialMarketCap: numbers.initialMarketCap,
      migrationMarketCap: numbers.migrationMarketCap,
      liquidityWeights: preset.liquidityWeights,
    });
  }

  if (
    numbers.initialMarketCap === undefined ||
    numbers.migrationMarketCap === undefined ||
    preset.percentageSupplyOnMigration === undefined
  ) {
    throw new Error(`Preset ${preset.id} is missing two-segment parameters.`);
  }
  return buildCurveWithTwoSegments({
    ...shared,
    initialMarketCap: numbers.initialMarketCap,
    migrationMarketCap: numbers.migrationMarketCap,
    percentageSupplyOnMigration: preset.percentageSupplyOnMigration,
  });
}

export function uiFromRaw(amount: BN | { toString(): string }, decimals: number): number {
  const raw = BigInt(amount.toString());
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;
  const digits = fraction.toString().padStart(decimals, "0").slice(0, 6);
  return Number(`${whole.toString()}.${digits}`);
}

export function rawFromUi(amount: number, decimals: number): BN {
  const [whole, fraction = ""] = amount.toString().split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return new BN(`${whole}${padded}`.replace(/^0+(?=\d)/, "") || "0");
}

function priceOf(sqrtPrice: BN, quote: QuoteKind): number {
  const price = getPriceFromSqrtPrice(sqrtPrice, BASE_DECIMALS, quoteDecimals(quote));
  const numeric = Number(price.toString());
  return Number.isFinite(numeric) ? numeric : 0;
}

export function curvePoints(config: ConfigParameters, quote: QuoteKind): CurvePoint[] {
  const active = config.curve.filter((segment) => !segment.liquidity.isZero());
  const graduationSqrt = getMigrationThresholdPrice(
    config.migrationQuoteThreshold,
    config.sqrtStartPrice,
    active,
  );
  const points: CurvePoint[] = [
    { price: priceOf(config.sqrtStartPrice, quote), liquidity: "0" },
  ];
  for (const segment of active) {
    if (segment.sqrtPrice.gt(graduationSqrt)) continue;
    points.push({
      price: priceOf(segment.sqrtPrice, quote),
      liquidity: segment.liquidity.toString(),
    });
  }
  const graduationPrice = priceOf(graduationSqrt, quote);
  const last = points[points.length - 1];
  if (!last || Math.abs(last.price - graduationPrice) / Math.max(Math.abs(graduationPrice), 1e-18) > 0.001) {
    points.push({
      price: graduationPrice,
      liquidity: active.length > 0 ? active[active.length - 1].liquidity.toString() : "0",
    });
  }
  return points;
}

const SAMPLES_PER_SEGMENT = 24;

/**
 * Price as a function of quote raised, from the start price to graduation.
 * Inside a DBC segment, quote in is linear in sqrt price: liquidity * (sqrtB - sqrtA) >> 128,
 * so sampling sqrt price evenly per segment traces the exact curve the program walks.
 */
export function curveProfile(config: ConfigParameters, quote: QuoteKind): ProfilePoint[] {
  const graduationSqrt = getMigrationThresholdPrice(
    config.migrationQuoteThreshold,
    config.sqrtStartPrice,
    config.curve.filter((segment) => !segment.liquidity.isZero()),
  );
  const scale = 10 ** quoteDecimals(quote);
  const profile: ProfilePoint[] = [{ raised: 0, price: priceOf(config.sqrtStartPrice, quote) }];
  let lower = config.sqrtStartPrice;
  let raisedRaw = new BN(0);
  for (const segment of config.curve) {
    if (lower.gte(graduationSqrt)) break;
    const upper = BN.min(segment.sqrtPrice, graduationSqrt);
    if (upper.lte(lower)) continue;
    if (segment.liquidity.isZero()) {
      lower = upper;
      continue;
    }
    const span = upper.sub(lower);
    for (let step = 1; step <= SAMPLES_PER_SEGMENT; step += 1) {
      const sqrt = lower.add(span.muln(step).divn(SAMPLES_PER_SEGMENT));
      const raw = raisedRaw.add(segment.liquidity.mul(sqrt.sub(lower)).shrn(128));
      profile.push({ raised: Number(raw.toString()) / scale, price: priceOf(sqrt, quote) });
    }
    raisedRaw = raisedRaw.add(segment.liquidity.mul(span).shrn(128));
    lower = upper;
  }
  return profile;
}

let previewClient: DynamicBondingCurveClient | null = null;

function clientForQuotes(): DynamicBondingCurveClient {
  if (!previewClient) {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    previewClient = DynamicBondingCurveClient.create(connection, "confirmed");
  }
  return previewClient;
}

export function quoteLaunchBuy(
  config: ConfigParameters,
  quote: QuoteKind,
  uiAmount: number,
): SwapQuote2Result {
  const client = clientForQuotes();
  return client.pool.getQuoteFromInputAmount({
    config,
    swapBaseForQuote: false,
    amountIn: rawFromUi(uiAmount, quoteDecimals(quote)),
    swapMode: SwapMode.PartialFill,
    slippageBps: 100,
    hasReferral: false,
    currentPoint: new BN(0),
  });
}

export function previewPreset(
  preset: LaunchPreset,
  quote: QuoteKind,
  profile: NetworkProfile,
  sampleBuy = quote === "SOL" ? 0.1 : 10,
): CurvePreview {
  const config = buildPresetConfig(preset, quote, profile);
  const points = curvePoints(config, quote);
  const sample = quoteLaunchBuy(config, quote, sampleBuy);
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable];
  if (!dammConfig) {
    throw new Error("DAMM v2 customizable migration config is missing from the SDK.");
  }
  return {
    config,
    points,
    profile: curveProfile(config, quote),
    startPrice: points[0]?.price ?? 0,
    endPrice: points[points.length - 1]?.price ?? 0,
    migrationQuote: uiFromRaw(config.migrationQuoteThreshold, quoteDecimals(quote)),
    migrationQuoteRaw: config.migrationQuoteThreshold.toString(),
    sampleBuyQuote: quote === "SOL" ? sampleBuy : sampleBuy,
    sampleBuyAmount: sampleBuy,
    sampleOutputRaw: sample.outputAmount.toString(),
    dammConfig: dammConfig.toBase58(),
  };
}

export function dammMigrationConfig(): PublicKey {
  const key = DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable];
  if (!key) throw new Error("DAMM v2 customizable fee config is not published in the SDK.");
  return key;
}
