import type { NetworkProfile, QuoteKind } from "./constants";

export type CurveShape = "flat" | "long" | "exponential";

/** Plain-language guide for a first listing. Shown next to the preset, not only on hover. */
export const SHAPE_GUIDE: Record<
  CurveShape,
  { title: string; hint: string; why: string }
> = {
  flat: {
    title: "Flat",
    hint: "Price climbs slowly while a large share of the float is sold.",
    why: "Use this for a thinly traded name that should stay near a reference price.",
  },
  long: {
    title: "Long",
    hint: "The book gets deeper as the listing price approaches.",
    why: "Use this when the equity needs a runway, not a one-candle open.",
  },
  exponential: {
    title: "Exponential",
    hint: "Opens thin, with a wide fee that decays as the book fills.",
    why: "Use this for an IPO-style listing where graduation is the event.",
  },
};
export type AccessTier = "free" | "paid";
export type CurveBuilderKind =
  | "buildCurve"
  | "buildCurveWithLiquidityWeights"
  | "buildCurveWithTwoSegments";

export interface LiquiditySplit {
  partnerPct: number;
  partnerLockedPct: number;
  creatorPct: number;
  creatorLockedPct: number;
}

export interface ProfileNumbers {
  /** Quote units required to finish the curve. Used by `buildCurve`. */
  migrationQuote?: number;
  /** Quote-denominated market cap at launch. */
  initialMarketCap?: number;
  /** Quote-denominated market cap at graduation. */
  migrationMarketCap?: number;
}

export interface LaunchPreset {
  id: string;
  name: string;
  shape: CurveShape;
  access: AccessTier;
  builder: CurveBuilderKind;
  publisher: string;
  summary: string;
  suitedFor: string;
  feeLabel: string;
  /** Suggested marketplace price in SOL. Null means the preset is free. */
  listedPriceSol: number | null;
  totalSupply: number;
  authority: "immutable" | "creator";
  creatorTradingFeePercentage: number;
  dynamicFee: boolean;
  enableFirstSwapWithMinFee: boolean;
  startingFeeBps: number;
  endingFeeBps: number;
  feeMode: "flat" | "linear" | "exponential";
  /** Fee scheduler length in seconds. Ignored when the fee is flat. */
  feeDurationSeconds: number;
  feePeriods: number;
  liquidity: LiquiditySplit;
  migratedPoolFeeBps: number;
  migratedDynamicFee: boolean;
  /** Share of supply sold on the curve before migration liquidity is reserved. */
  percentageSupplyOnMigration?: number;
  /** Sixteen or fewer weights. Rising weights flatten the later book. */
  liquidityWeights?: number[];
  /** Per quote token, because market cap is denominated in the quote. */
  profiles: Record<NetworkProfile, Record<QuoteKind, ProfileNumbers>>;
}

const issuerLock: LiquiditySplit = {
  partnerPct: 0,
  partnerLockedPct: 20,
  creatorPct: 0,
  creatorLockedPct: 80,
};

const sharedSupply = 1_000_000;

function bothQuotes(
  sandbox: ProfileNumbers,
  keeper: ProfileNumbers,
): Record<NetworkProfile, Record<QuoteKind, ProfileNumbers>> {
  return {
    sandbox: { SOL: sandbox, USDC: scaleQuote(sandbox, 100) },
    keeper: { SOL: keeper, USDC: scaleQuote(keeper, 75) },
  };
}

/** USDC notionals are larger than SOL notionals. 1 SOL sandbox ~ 100 USDC; keeper 10 SOL ~ 750 USDC. */
function scaleQuote(source: ProfileNumbers, factor: number): ProfileNumbers {
  return {
    migrationQuote:
      source.migrationQuote === undefined ? undefined : source.migrationQuote * factor,
    initialMarketCap:
      source.initialMarketCap === undefined ? undefined : source.initialMarketCap * factor,
    migrationMarketCap:
      source.migrationMarketCap === undefined ? undefined : source.migrationMarketCap * factor,
  };
}

export const LAUNCH_PRESETS: LaunchPreset[] = [
  {
    id: "desk-flat",
    name: "Desk Flat",
    shape: "flat",
    access: "free",
    builder: "buildCurve",
    publisher: "StockCurve",
    summary:
      "A single-segment curve that sells a large share of the float before graduation, with a constant 30 bps fee. Built for tokenized common stock that should not behave like a meme curve.",
    suitedFor: "Tokenized common stock and reference-price RWAs",
    feeLabel: "30 bps flat, quote-denominated",
    listedPriceSol: null,
    totalSupply: sharedSupply,
    authority: "immutable",
    creatorTradingFeePercentage: 50,
    dynamicFee: true,
    enableFirstSwapWithMinFee: true,
    startingFeeBps: 30,
    endingFeeBps: 30,
    feeMode: "flat",
    feeDurationSeconds: 0,
    feePeriods: 0,
    liquidity: issuerLock,
    migratedPoolFeeBps: 30,
    migratedDynamicFee: true,
    percentageSupplyOnMigration: 35,
    profiles: bothQuotes(
      { migrationQuote: 0.5 },
      { migrationQuote: 10 },
    ),
  },
  {
    id: "runway-long",
    name: "Runway Long",
    shape: "long",
    access: "free",
    builder: "buildCurveWithLiquidityWeights",
    publisher: "StockCurve",
    summary:
      "Sixteen curve segments with liquidity increasing into the graduation price, so early prints move and the book thickens as the listing price approaches. Fees decay linearly from 80 bps to 30 bps over 24 hours.",
    suitedFor: "Pre-listing equity and slow price discovery",
    feeLabel: "80 → 30 bps linear over 24h",
    listedPriceSol: null,
    totalSupply: sharedSupply,
    authority: "creator",
    creatorTradingFeePercentage: 50,
    dynamicFee: true,
    enableFirstSwapWithMinFee: true,
    startingFeeBps: 80,
    endingFeeBps: 30,
    feeMode: "linear",
    feeDurationSeconds: 86_400,
    feePeriods: 24,
    liquidity: issuerLock,
    migratedPoolFeeBps: 25,
    migratedDynamicFee: true,
    liquidityWeights: [1, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16],
    profiles: bothQuotes(
      { initialMarketCap: 4, migrationMarketCap: 16 },
      { initialMarketCap: 80, migrationMarketCap: 320 },
    ),
  },
  {
    id: "listing-exponential",
    name: "Listing Exponential",
    shape: "exponential",
    access: "free",
    builder: "buildCurveWithTwoSegments",
    publisher: "StockCurve",
    summary:
      "Two-segment curve from a low initial market cap to a much higher graduation cap, with an exponential fee that starts wide for a thin opening book and decays to 30 bps.",
    suitedFor: "IPO-style listings and event-driven floats",
    feeLabel: "250 → 30 bps exponential over 6h",
    listedPriceSol: null,
    totalSupply: sharedSupply,
    authority: "creator",
    creatorTradingFeePercentage: 40,
    dynamicFee: true,
    enableFirstSwapWithMinFee: false,
    startingFeeBps: 250,
    endingFeeBps: 30,
    feeMode: "exponential",
    feeDurationSeconds: 21_600,
    feePeriods: 36,
    liquidity: issuerLock,
    migratedPoolFeeBps: 50,
    migratedDynamicFee: true,
    percentageSupplyOnMigration: 18,
    profiles: bothQuotes(
      { initialMarketCap: 2, migrationMarketCap: 40 },
      { initialMarketCap: 40, migrationMarketCap: 800 },
    ),
  },
  {
    id: "thin-book-usdc",
    name: "Thin Book",
    shape: "flat",
    access: "free",
    builder: "buildCurve",
    publisher: "StockCurve",
    summary:
      "Flat curve with a wider 100 bps base fee plus Meteora's dynamic fee, for pairs that will not trade continuously. Quote in USDC when the equity should be marked in dollars.",
    suitedFor: "Thinly traded tokenized stock quoted in a stablecoin",
    feeLabel: "100 bps flat + dynamic fee",
    listedPriceSol: null,
    totalSupply: sharedSupply,
    authority: "immutable",
    creatorTradingFeePercentage: 60,
    dynamicFee: true,
    enableFirstSwapWithMinFee: true,
    startingFeeBps: 100,
    endingFeeBps: 100,
    feeMode: "flat",
    feeDurationSeconds: 0,
    feePeriods: 0,
    liquidity: issuerLock,
    migratedPoolFeeBps: 100,
    migratedDynamicFee: true,
    percentageSupplyOnMigration: 25,
    profiles: bothQuotes(
      { migrationQuote: 1 },
      { migrationQuote: 10 },
    ),
  },
  {
    id: "issuer-lock",
    name: "Issuer Lock",
    shape: "long",
    access: "free",
    builder: "buildCurveWithLiquidityWeights",
    publisher: "StockCurve",
    summary:
      "Long runway with 80% of graduated DAMM v2 liquidity permanently locked to the issuer and 20% permanently locked to the config partner. No unlocked LP is returned to either side.",
    suitedFor: "Issuer-aligned equity where the LP should not be dumped",
    feeLabel: "60 → 25 bps linear over 12h",
    listedPriceSol: null,
    totalSupply: sharedSupply,
    authority: "immutable",
    creatorTradingFeePercentage: 70,
    dynamicFee: false,
    enableFirstSwapWithMinFee: true,
    startingFeeBps: 60,
    endingFeeBps: 25,
    feeMode: "linear",
    feeDurationSeconds: 43_200,
    feePeriods: 12,
    liquidity: issuerLock,
    migratedPoolFeeBps: 25,
    migratedDynamicFee: false,
    liquidityWeights: [2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 12, 12, 14, 16],
    profiles: bothQuotes(
      { initialMarketCap: 5, migrationMarketCap: 20 },
      { initialMarketCap: 100, migrationMarketCap: 400 },
    ),
  },
  {
    id: "prime-book",
    name: "Prime Book",
    shape: "exponential",
    access: "paid",
    builder: "buildCurveWithTwoSegments",
    publisher: "StockCurve desk",
    summary:
      "A tighter exponential listing curve with a 40 bps opening fee. The parameters are visible so teams can review them. Using the preset is gated by the payment extension point and is not unlocked in this build.",
    suitedFor: "Sponsored listings once a payment rail is configured",
    feeLabel: "40 → 25 bps exponential over 2h",
    listedPriceSol: 0.5,
    totalSupply: sharedSupply,
    authority: "immutable",
    creatorTradingFeePercentage: 50,
    dynamicFee: true,
    enableFirstSwapWithMinFee: true,
    startingFeeBps: 40,
    endingFeeBps: 25,
    feeMode: "exponential",
    feeDurationSeconds: 7_200,
    feePeriods: 12,
    liquidity: issuerLock,
    migratedPoolFeeBps: 25,
    migratedDynamicFee: true,
    percentageSupplyOnMigration: 20,
    profiles: bothQuotes(
      { initialMarketCap: 3, migrationMarketCap: 36 },
      { initialMarketCap: 60, migrationMarketCap: 720 },
    ),
  },
];

export function getPreset(id: string): LaunchPreset | undefined {
  return LAUNCH_PRESETS.find((preset) => preset.id === id);
}
