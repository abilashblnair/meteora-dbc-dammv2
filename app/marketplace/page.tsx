import { PresetBrowser } from "@/components/PresetBrowser";
import { LAUNCH_PRESETS } from "@/lib/meteora/presets";

export default function MarketplacePage() {
  return (
    <div className="section">
      <p className="kicker">Preset marketplace</p>
      <h1>Launch configs</h1>
      <p className="lede">
        Free presets are ready to sign. Prime Book is listed with a price and stays locked until a PresetAccessProvider
        reports that a real payment settled. The parameters stay visible so a team can review the book before wiring payment.
      </p>
      <PresetBrowser presets={LAUNCH_PRESETS} />
    </div>
  );
}
