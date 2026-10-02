import { PresetBrowser } from "@/components/PresetBrowser";
import { previewPreset, type ProfilePoint } from "@/lib/meteora/curve";
import { LAUNCH_PRESETS } from "@/lib/meteora/presets";

export default function MarketplacePage() {
  const profiles: Record<string, ProfilePoint[]> = {};
  for (const preset of LAUNCH_PRESETS) {
    try {
      profiles[preset.id] = previewPreset(preset, "SOL", "sandbox").profile;
    } catch {
      profiles[preset.id] = [];
    }
  }

  return (
    <div className="section">
      <p className="kicker">Preset marketplace</p>
      <h1>Launch configs</h1>
      <p className="lede">
        Flat, Long, and Exponential describe the book, not a meme curve. Free presets are ready to sign. Prime Book stays
        locked unless you turn on the labeled judge demo unlock, which collects no SOL.
      </p>
      <PresetBrowser presets={LAUNCH_PRESETS} profiles={profiles} />
    </div>
  );
}
