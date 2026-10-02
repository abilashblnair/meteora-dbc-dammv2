"use client";

import { formatCompact, formatPrice } from "@/lib/format";
import type { ProfilePoint } from "@/lib/meteora/curve";
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_WIDTH = 560;
const PAD = { top: 16, right: 12, bottom: 30, left: 62 };

/** Price against quote raised, from the opening price to the DAMM v2 graduation price. */
export function CurveChart({ profile, quote }: { profile: ProfilePoint[]; quote: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // The viewBox tracks the rendered width so axis text stays at its CSS size instead of scaling with the card.
  const [WIDTH, setWidth] = useState(DEFAULT_WIDTH);
  const HEIGHT = Math.round(Math.min(280, Math.max(190, WIDTH * 0.48)));

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const points = profile.filter((point) => Number.isFinite(point.price) && Number.isFinite(point.raised));
    const maxRaised = Math.max(...points.map((point) => point.raised), 1e-12);
    const maxPrice = Math.max(...points.map((point) => point.price), 1e-18);
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (raised: number) => PAD.left + (raised / maxRaised) * plotW;
    const y = (price: number) => PAD.top + plotH - (price / maxPrice) * plotH;
    const coords = points.map((point) => ({ ...point, cx: x(point.raised), cy: y(point.price) }));
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(" ");
    const base = PAD.top + plotH;
    const area = coords.length
      ? `${line} L${coords[coords.length - 1].cx.toFixed(1)},${base} L${coords[0].cx.toFixed(1)},${base} Z`
      : "";
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: maxPrice * f, y: y(maxPrice * f) }));
    const xTicks = [0, 0.5, 1].map((f) => ({ value: maxRaised * f, x: x(maxRaised * f) }));
    return { coords, line, area, base, yTicks, xTicks };
  }, [profile, WIDTH, HEIGHT]);

  const { coords } = geometry;
  if (coords.length < 2) return <p className="fine">The curve builder returned no segments to plot.</p>;
  const start = coords[0];
  const end = coords[coords.length - 1];
  const active = hover === null ? null : coords[hover];
  const multiple = start.price > 0 ? end.price / start.price : 0;

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    for (let i = 1; i < coords.length; i += 1) {
      if (Math.abs(coords[i].cx - px) < Math.abs(coords[best].cx - px)) best = i;
    }
    setHover(best);
  }

  return (
    <figure className="curve">
      <div className="curve-readout">
        <div>
          <span className="fine">{active ? "Price at cursor" : "Opening price"}</span>
          <strong className="mono">{formatPrice(active ? active.price : start.price)} {quote}</strong>
        </div>
        <div>
          <span className="fine">{active ? "Raised so far" : "Graduates at"}</span>
          <strong className="mono">{formatCompact(active ? active.raised : end.raised)} {quote}</strong>
        </div>
        <div>
          <span className="fine">Open → graduation</span>
          <strong className="mono">{multiple ? `${multiple.toFixed(multiple >= 10 ? 0 : 1)}×` : "—"}</strong>
        </div>
      </div>
      <div ref={frameRef}>
        <svg
          ref={svgRef}
          className="chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Bonding curve: price rises from ${formatPrice(start.price)} to ${formatPrice(end.price)} ${quote} as ${formatCompact(end.raised)} ${quote} is raised`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {geometry.yTicks.map((tick) => (
            <g key={tick.y}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={tick.y} y2={tick.y} className="chart-grid" />
              <text x={PAD.left - 8} y={tick.y + 4} textAnchor="end" className="chart-tick">
                {tick.value === 0 ? "0" : formatPrice(tick.value)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((tick, index) => (
            <text
              key={tick.x}
              x={tick.x}
              y={HEIGHT - 10}
              textAnchor={index === 0 ? "start" : index === geometry.xTicks.length - 1 ? "end" : "middle"}
              className="chart-tick"
            >
              {formatCompact(tick.value)} {quote}
            </text>
          ))}
          <path d={geometry.area} fill="url(#curve-fill)" />
          <path d={geometry.line} fill="none" className="chart-line" />
          <line x1={end.cx} x2={end.cx} y1={PAD.top} y2={geometry.base} className="chart-grad" />
          <text x={end.cx - 6} y={PAD.top + 12} textAnchor="end" className="chart-flag">
            DAMM v2
          </text>
          <circle cx={start.cx} cy={start.cy} r={4} className="chart-dot" />
          <circle cx={end.cx} cy={end.cy} r={5} className="chart-dot end" />
          {active && (
            <g>
              <line x1={active.cx} x2={active.cx} y1={PAD.top} y2={geometry.base} className="chart-cursor" />
              <circle cx={active.cx} cy={active.cy} r={5} className="chart-dot hover" />
            </g>
          )}
        </svg>
      </div>
      <figcaption className="fine">
        Price against {quote} raised, traced from the DBC config segments. The pool graduates to DAMM v2 at the right edge.
      </figcaption>
    </figure>
  );
}
