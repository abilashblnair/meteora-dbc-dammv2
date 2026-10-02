"use client";

import { DemoUnlock, useDemoUnlock } from "@/components/DemoUnlock";
import { Sparkline } from "@/components/Sparkline";
import { decidePresetAccess } from "@/lib/marketplace/access";
import type { ProfilePoint } from "@/lib/meteora/curve";
import { SHAPE_GUIDE, type LaunchPreset } from "@/lib/meteora/presets";
import Link from "next/link";
import { useMemo, useState } from "react";

const FILTERS = ["all", "flat", "long", "exponential", "free", "paid"] as const;

export function PresetBrowser({
  presets,
  profiles,
}: {
  presets: LaunchPreset[];
  /** Sandbox SOL curve per preset id, computed on the server so the SDK stays out of this bundle. */
  profiles: Record<string, ProfilePoint[]>;
}) {
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
          <article key={shape}>
            <span className="tag shape">{SHAPE_GUIDE[shape].title}</span>
            <p>
              <strong>{SHAPE_GUIDE[shape].hint}</strong> {SHAPE_GUIDE[shape].why}
            </p>
          </article>
        ))}
      </div>
      <div className="toolbar">
        <div className="filters" role="tablist" aria-label="Filter presets">
          {FILTERS.map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={item === filter}
              className={item === filter ? "active" : ""}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <span className="fine">{visible.length} of {presets.length} presets</span>
      </div>
      <DemoUnlock enabled={unlock.enabled} forced={unlock.forced} onChange={unlock.setEnabled} />
      <div className="card-grid">
        {visible.map((preset) => {
          const access = decidePresetAccess(preset, unlock.enabled);
          const shape = SHAPE_GUIDE[preset.shape];
          const profile = profiles[preset.id] ?? [];
          return (
            <article className={`card preset-card ${access.allowed ? "" : "locked"}`} key={preset.id}>
              <div className="tags">
                <span className="tag shape" title={shape.hint}>{shape.title}</span>
                <span className={`tag ${preset.access}`}>
                  {preset.access === "free" ? "Free" : `${preset.listedPriceSol} SOL`}
                </span>
              </div>
              <h3>{preset.name}</h3>
              {profile.length > 1 && <Sparkline profile={profile} label={`${preset.name} curve shape`} />}
              <p>{preset.summary}</p>
              <dl className="spec">
                <div>
                  <dt>Fees</dt>
                  <dd className="mono">{preset.feeLabel}</dd>
                </div>
                <div>
                  <dt>DBC builder</dt>
                  <dd className="mono">{preset.builder}</dd>
                </div>
                <div>
                  <dt>Suited for</dt>
                  <dd>{preset.suitedFor}</dd>
                </div>
              </dl>
              {preset.access === "paid" && <p className="fine access-note">{access.reason}</p>}
              <div className="card-foot">
                {access.allowed ? (
                  <Link className="button block" href={`/launch?preset=${preset.id}`}>
                    Use preset
                  </Link>
                ) : (
                  <button className="button-secondary block" type="button" disabled>
                    <LockIcon /> Locked · payment rail required
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
