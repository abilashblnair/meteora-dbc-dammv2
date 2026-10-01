import { DEFAULT_RPC, type SolanaNetwork } from "@/lib/meteora/constants";

export function defaultNetwork(): SolanaNetwork {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

export function rpcUrlFor(network: SolanaNetwork): string {
  if (network === "devnet") {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC.devnet;
  }
  return process.env.NEXT_PUBLIC_MAINNET_RPC_URL || DEFAULT_RPC["mainnet-beta"];
}
