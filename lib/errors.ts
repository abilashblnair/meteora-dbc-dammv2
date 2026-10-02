function rawMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const withLogs = error as Error & { logs?: string[] };
    const tail = Array.isArray(withLogs.logs) ? withLogs.logs.slice(-6).join("\n") : "";
    return tail ? `${error.message}\n${tail}` : error.message;
  }
  return String(error);
}

function adviceFor(message: string): string | null {
  const text = message.toLowerCase();
  if (/user rejected|rejected the request|wallet sign|declined/.test(text)) {
    return "The wallet declined the signature. Approve the transaction in Phantom or Solflare to continue. Nothing was submitted.";
  }
  if (/not connected|connect a wallet|wallet not/.test(text)) {
    return "Connect Phantom or Solflare with the network selected in the header, then try again.";
  }
  // Checked before low-SOL: the DBC program says "insufficient liquidity" when an exact-in buy is larger
  // than what is left on the curve before graduation. That is not a balance problem.
  if (/insufficient ?liquidity|not enough liquidity/.test(text)) {
    return "This buy is larger than what is left on the curve before graduation. Turn on Partial fill so the curve takes only what it needs and refunds the rest, or buy a smaller amount. Once the reserve reaches the threshold, graduate the pool.";
  }
  if (/insufficient funds|insufficient lamports|debit an account but found no record|0x1$/.test(text)) {
    return "The wallet does not have enough SOL for rent and fees. On a SOL-quoted pool it also needs SOL for the swap. On devnet, request SOL from https://faucet.solana.com and leave a little extra for fees.";
  }
  if (/blockhash|block height exceeded|transaction expired|timeout/.test(text)) {
    return "The RPC did not confirm before the blockhash expired. Retry once. If it keeps happening, set NEXT_PUBLIC_SOLANA_RPC_URL or NEXT_PUBLIC_MAINNET_RPC_URL to your own endpoint.";
  }
  if (/429|rate limit|too many requests/.test(text)) {
    return "The public RPC rate-limited this request. Wait a few seconds and refresh, or put your own RPC URL in .env.local.";
  }
  if (/failed to fetch|networkerror|econnrefused|enotfound/.test(text)) {
    return "The browser could not reach the RPC. Check the network toggle and the RPC URL in .env.local.";
  }
  if (/not a solana address|invalid public key/.test(text)) {
    return "Paste the DBC pool address from the Book page, or from the explorer link after the pool signature confirms.";
  }
  if (/threshold|will not submit a graduation|already graduated|already marked migrated/.test(text)) {
    return message;
  }
  if (/below the migration|quote reserve/.test(text)) {
    return message;
  }
  return null;
}

/** Actionable copy first, then the RPC or wallet detail. Never reports a signature that was not confirmed. */
export function explainError(error: unknown): string {
  const message = rawMessage(error);
  const advice = adviceFor(message);
  if (!advice) return message;
  if (advice === message) return message;
  return `${advice}\n\nDetail: ${message}`;
}
