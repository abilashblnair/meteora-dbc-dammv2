import { PoolDesk } from "@/components/PoolDesk";

export default async function PoolPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <div className="section">
      <PoolDesk address={address} />
    </div>
  );
}
