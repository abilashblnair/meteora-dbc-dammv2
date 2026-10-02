"use client";

import {
  DEMO_UNLOCK_STORAGE_KEY,
  environmentDemoUnlock,
  readSessionDemoUnlock,
} from "@/lib/marketplace/access";
import { useEffect, useState } from "react";

export function useDemoUnlock() {
  const forced = environmentDemoUnlock();
  const [sessionOn, setSessionOn] = useState(false);

  useEffect(() => {
    setSessionOn(readSessionDemoUnlock());
  }, []);

  function setEnabled(next: boolean) {
    if (forced) return;
    window.sessionStorage.setItem(DEMO_UNLOCK_STORAGE_KEY, next ? "1" : "0");
    setSessionOn(next);
  }

  return { enabled: forced || sessionOn, forced, setEnabled };
}

export function DemoUnlock({
  enabled,
  forced,
  onChange,
}: {
  enabled: boolean;
  forced: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`demo-banner ${enabled ? "on" : ""}`}>
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={forced}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
        <span className="switch-label">Judge demo unlock</span>
      </label>
      <p>
        {enabled
          ? "Prime Book can be signed for this browser session. No 0.5 SOL payment is collected, and the preset still says so."
          : "Paid presets stay locked. This switch is a labeled demo flag, not a checkout."}
        {forced ? " The environment flag NEXT_PUBLIC_DEMO_UNLOCK_PAID_PRESETS is on." : ""}
      </p>
    </div>
  );
}
