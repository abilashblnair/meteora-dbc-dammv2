import { PublicKey } from "@solana/web3.js";

/** Same program id on mainnet and devnet. */
export const DBC_PROGRAM_ID = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";

/** Same program id on mainnet and devnet. */
export const DAMM_V2_PROGRAM_ID = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

export const DBC_POOL_AUTHORITY = "FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM";

export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

/** Circle USDC. Mainnet keepers graduate pools that reach 750 USDC. */
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Circle devnet USDC (6 decimals). There is no devnet migration keeper. */
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const NETWORKS = ["devnet", "mainnet-beta"] as const;
export type SolanaNetwork = (typeof NETWORKS)[number];

export type QuoteKind = "SOL" | "USDC";
export type NetworkProfile = "sandbox" | "keeper";

export const KEEPER_MIN_QUOTE: Record<QuoteKind, number> = {
  SOL: 10,
  USDC: 750,
};

export const DEFAULT_RPC: Record<SolanaNetwork, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export function quoteMintFor(network: SolanaNetwork, quote: QuoteKind): PublicKey {
  if (quote === "SOL") return new PublicKey(NATIVE_SOL_MINT);
  return new PublicKey(network === "devnet" ? DEVNET_USDC_MINT : MAINNET_USDC_MINT);
}

export function quoteDecimals(quote: QuoteKind): number {
  return quote === "SOL" ? 9 : 6;
}

export function quoteSymbol(quote: QuoteKind): string {
  return quote;
}
