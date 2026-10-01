import type { SolanaNetwork, NetworkProfile, QuoteKind } from "@/lib/meteora/constants";

export interface LaunchRecord {
  network: SolanaNetwork;
  name: string;
  symbol: string;
  uri: string;
  presetId: string;
  profile: NetworkProfile;
  quote: QuoteKind;
  pool: string;
  config: string;
  baseMint: string;
  quoteMint: string;
  creator: string;
  configSignature: string;
  poolSignature: string;
  createdAt: number;
}

const KEY = "stockcurve.launches.v1";

export function readLaunches(): LaunchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as LaunchRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLaunch(record: LaunchRecord): LaunchRecord[] {
  const next = [record, ...readLaunches().filter((item) => item.pool !== record.pool)];
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
