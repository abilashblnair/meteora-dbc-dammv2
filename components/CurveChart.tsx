import { formatPrice } from "@/lib/format";

export function CurveChart({
  points,
  startLabel,
  endLabel,
}: {
  points: { price: number }[];
  startLabel: string;
  endLabel: string;
}) {
  const width = 640;
  const height = 260;
  const pad = 18;
  const prices = points.map((point) => point.price).filter((price) => Number.isFinite(price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((point.price - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const line = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(" ");
  const fill = `${line} L${coords[coords.length - 1]?.x ?? pad},${height - pad} L${coords[0]?.x ?? pad},${height - pad} Z`;

  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bonding curve from opening price to graduation price">
        <path d={fill} fill="rgba(47, 109, 74, 0.16)" />
        <path d={line} fill="none" stroke="#8a6420" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((coord, index) => (
          <circle key={index} cx={coord.x} cy={coord.y} r={index === 0 || index === coords.length - 1 ? 4.5 : 3} fill="#121712" />
        ))}
      </svg>
      <div className="chart-caption">
        <span>Open {startLabel}</span>
        <span>Graduate {endLabel}</span>
      </div>
      <p className="fine">
        {points.length} plotted prices from the DBC curve builder. The last point is the migration threshold price, not an unbounded max price.
      </p>
    </figure>
  );
}

export function priceLabel(value: number, quote: string): string {
  return `${formatPrice(value)} ${quote}`;
}
