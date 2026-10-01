import { LaunchWizard } from "@/components/LaunchWizard";
import { Suspense } from "react";

export default async function LaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="section">
      <p className="kicker">Create</p>
      <h1>New listing</h1>
      <p className="lede">
        Two signatures: one creates the DBC config, the next creates the virtual pool. Both are built with
        @meteora-ag/dynamic-bonding-curve-sdk. Devnet is the default network.
      </p>
      <Suspense fallback={<p>Loading the desk…</p>}>
        <LaunchWizard initialPreset={params.preset} />
      </Suspense>
    </div>
  );
}
