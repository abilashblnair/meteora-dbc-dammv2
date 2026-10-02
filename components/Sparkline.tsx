import type { ProfilePoint } from "@/lib/meteora/curve";

/** Small price-vs-raised trace for preset cards. */
export function Sparkline({ profile, label }: { profile: ProfilePoint[]; label: string }) {
  const width = 240;
  const height = 64;
  const pad = 4;
  const maxRaised = Math.max(...profile.map((point) => point.raised), 1e-12);
  const maxPrice = Math.max(...profile.map((point) => point.price), 1e-18);
  const coords = profile.map((point) => [
    pad + (point.raised / maxRaised) * (width - pad * 2),
    height - pad - (point.price / maxPrice) * (height - pad * 2),
  ]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1] ?? [pad, height - pad];
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      <path d={`${line} L${last[0]},${height - pad} L${pad},${height - pad} Z`} className="sparkline-area" />
      <path d={line} className="sparkline-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
