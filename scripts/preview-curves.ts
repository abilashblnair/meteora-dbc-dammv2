import { MigrationOption } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { freePresetAccess } from "../lib/marketplace/access";
import { KEEPER_MIN_QUOTE, type QuoteKind } from "../lib/meteora/constants";
import { previewPreset } from "../lib/meteora/curve";
import { LAUNCH_PRESETS } from "../lib/meteora/presets";

const quotes: QuoteKind[] = ["SOL", "USDC"];
let failed = 0;

for (const preset of LAUNCH_PRESETS) {
  const access = freePresetAccess.check(preset);
  if (preset.access === "free" && !access.allowed) {
    console.error(`free preset blocked: ${preset.id}`);
    failed += 1;
  }
  if (preset.access === "paid" && access.allowed) {
    console.error(`paid preset was unlocked without a payment provider: ${preset.id}`);
    failed += 1;
  }

  for (const quote of quotes) {
    for (const profile of ["sandbox", "keeper"] as const) {
      try {
        const preview = previewPreset(preset, quote, profile);
        if (preview.config.migrationOption !== MigrationOption.MET_DAMM_V2) {
          throw new Error("migration option is not DAMM v2");
        }
        if (preview.points.length < 2) throw new Error("curve has no segments");
        if (preview.config.curve.length === 0) throw new Error("empty curve");
        if (BigInt(preview.sampleOutputRaw) <= 0n) throw new Error("sample buy output is zero");
        if (profile === "keeper" && preview.migrationQuote + 1e-6 < KEEPER_MIN_QUOTE[quote]) {
          throw new Error(
            `keeper threshold ${preview.migrationQuote} ${quote} is below ${KEEPER_MIN_QUOTE[quote]}`,
          );
        }
        console.log(
          [
            preset.id.padEnd(22),
            profile.padEnd(8),
            quote.padEnd(4),
            `threshold=${preview.migrationQuote}`,
            `price=${preview.startPrice.toExponential(3)}→${preview.endPrice.toExponential(3)}`,
            `buyOut=${preview.sampleOutputRaw}`,
            `damm=${preview.dammConfig.slice(0, 4)}…`,
          ].join("  "),
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`FAIL ${preset.id} ${profile} ${quote}: ${message}`);
      }
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} preset check(s) failed.`);
  process.exit(1);
}

console.log("\nAll preset curves built with the Meteora DBC SDK and quote on DAMM v2 migration.");
