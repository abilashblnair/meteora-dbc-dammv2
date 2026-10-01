import type { LaunchPreset } from "@/lib/meteora/presets";

export interface PresetAccessDecision {
  allowed: boolean;
  /** Shown in the UI. Does not claim an on-chain payment occurred. */
  reason: string;
}

/**
 * Plug a real payment rail in here. A provider may check a signature,
 * an NFT, or a server receipt. It must not report `allowed` unless
 * payment actually settled.
 */
export interface PresetAccessProvider {
  id: string;
  check(preset: LaunchPreset): PresetAccessDecision;
}

export const freePresetAccess: PresetAccessProvider = {
  id: "free-only",
  check(preset) {
    if (preset.access === "free") {
      return { allowed: true, reason: "Curated free preset." };
    }
    const price =
      preset.listedPriceSol === null ? "a fee" : `${preset.listedPriceSol} SOL`;
    return {
      allowed: false,
      reason: `This preset is listed at ${price}. StockCurve does not collect that fee. Implement PresetAccessProvider.check so it returns allowed only after a real payment settles.`,
    };
  },
};

export function assertPresetUsable(
  preset: LaunchPreset,
  provider: PresetAccessProvider = freePresetAccess,
): PresetAccessDecision {
  const decision = provider.check(preset);
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }
  return decision;
}
