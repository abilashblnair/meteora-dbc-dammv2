"use client";

import { DemoUnlock, useDemoUnlock } from "@/components/DemoUnlock";
import { decidePresetAccess } from "@/lib/marketplace/access";
import { SHAPE_GUIDE, type LaunchPreset } from "@/lib/meteora/presets";
import Link from "next/link";
import { useMemo, useState } from "react";

const FILTERS = ["all", "flat", "long", "exponential", "free", "paid"] as const;

export function PresetBrowser({ presets }: { presets: LaunchPreset[] }) {
  const unlock = useDemoUnlock();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const visible = useMemo(
    () =>
      presets.filter((preset) => {
        if (filter === "all") return true;
        if (filter === "free" || filter === "paid") return preset.access === filter;
        return preset.shape === filter;
      }),
    [filter, presets],
  );

  return (
    <div>
      <div className="shape-guide">
        {(Object.keys(SHAPE_GUIDE) as (keyof typeof SHAPE_GUIDE)[]).map((shape) => (
          <p key={shape} title={SHAPE_GUIDE[shape].why}>
            <strong>{SHAPE_GUIDE[shape].title}.</strong> {SHAPE_GUIDE[shape].hint} {SHAPE_GUIDE[shape].why}
          </p>
        ))}
      </div>
      <DemoUnlock enabled={unlock.enabled} forced={unlock.forced} onChange={unlock.setEnabled} />
      <div className="filters">
        {FILTERS.map((item) => (
          <button key={item} className={item === filter ? "active" : ""} onClick={() => setFilter(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <div className="card-grid">
        {visible.map((preset) => {
          const access = decidePresetAccess(preset, unlock.enabled);
          const shape = SHAPE_GUIDE[preset.shape];
          return (
            <article className="card" key={preset.id}>
              <div className="tags">
                <span className="tag shape" title={shape.hint}>{shape.title}</span>
                <span className={`tag ${preset.access}`}>{preset.access === "free" ? "Free" : `${preset.listedPriceSol} SOL listed`}</span>
              </div>
              <h3>{preset.name}</h3>
              <p>{preset.summary}</p>
              <p className="fine mono">{preset.feeLabel}</p>
              <p className="fine" title={shape.why}>{shape.hint}</p>
              <p className="fine">{preset.suitedFor}</p>
              <p className="fine">{access.reason}</p>
              {access.allowed ? (
                <Link className="button" href={`/launch?preset=${preset.id}`}>
                  Use preset
                </Link>
              ) : (
                <button className="button" type="button" disabled>
                  Payment rail required
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
