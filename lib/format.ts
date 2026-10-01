export function shortKey(value: string, size = 4): string {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

export function formatRaw(raw: string, decimals: number, digits = 4): string {
  const negative = raw.startsWith("-");
  const digitsOnly = negative ? raw.slice(1) : raw;
  const padded = digitsOnly.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals, padded.length - decimals + digits);
  const trimmed = fraction.replace(/0+$/, "");
  const body = trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
  return negative ? `-${body}` : body;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toExponential(3);
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 4 });
}

export function explorerAccount(address: string, network: string): string {
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;
  return `https://explorer.solana.com/address/${address}${cluster}`;
}

export function explorerTx(signature: string, network: string): string {
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}
