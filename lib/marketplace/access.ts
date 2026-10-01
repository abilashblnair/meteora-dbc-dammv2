import type { LaunchPreset } from "@/lib/meteora/presets";

export const DEMO_UNLOCK_STORAGE_KEY = "stockcurve.demoUnlockPaidPresets";

export interface PresetAccessDecision {
  allowed: boolean;
  /** Shown in the UI. A demo unlock must say that no payment settled. */
  reason: string;
  /** True only for the labeled judge flag. Never means a fee was collected. */
  demoUnlock: boolean;
}

/**
 * Plug a real payment rail in here. A provider may check a signature,
 * an NFT, or a server receipt. It must not report `allowed` unless
 * payment actually settled. The judge demo flag is a separate, labeled path.
 */
export interface PresetAccessProvider {
  id: string;
  check(preset: LaunchPreset): PresetAccessDecision;
}

export function environmentDemoUnlock(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_UNLOCK_PAID_PRESETS === "true";
}

export function readSessionDemoUnlock(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DEMO_UNLOCK_STORAGE_KEY) === "1";
}

export function demoUnlockActive(): boolean {
  return environmentDemoUnlock() || readSessionDemoUnlock();
}

export function decidePresetAccess(preset: LaunchPreset, demoUnlock: boolean): PresetAccessDecision {
  if (preset.access === "free") {
    return { allowed: true, reason: "Curated free preset.", demoUnlock: false };
  }
  const price = preset.listedPriceSol === null ? "a fee" : `${preset.listedPriceSol} SOL`;
  if (demoUnlock) {
    return {
      allowed: true,
      reason: `Judge demo unlock is on for this ${price} listing. No SOL was collected. This is not a settled payment.`,
      demoUnlock: true,
    };
  }
  return {
    allowed: false,
    reason: `Listed at ${price}. StockCurve does not collect that fee. Use the labeled Judge demo unlock to sign it in a walkthrough, or implement PresetAccessProvider after a real payment.`,
    demoUnlock: false,
  };
}

export const freePresetAccess: PresetAccessProvider = {
  id: "free-only",
  check(preset) {
    return decidePresetAccess(preset, demoUnlockActive());
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
