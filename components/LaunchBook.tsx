"use client";

import { useNetwork } from "@/components/Providers";
import { shortKey } from "@/lib/format";
import { readLaunches, type LaunchRecord } from "@/lib/storage";
import Link from "next/link";
import { useEffect, useState } from "react";

export function LaunchBook() {
  const { network } = useNetwork();
  const [rows, setRows] = useState<LaunchRecord[]>([]);
  const [address, setAddress] = useState("");

  useEffect(() => {
    setRows(readLaunches());
  }, []);

  const visible = rows.filter((row) => row.network === network);

  return (
    <div>
      <div className="paper" style={{ marginBottom: 16 }}>
        <h2>Open a pool</h2>
        <p>Any DBC pool address on the selected network. This does not require the launch to have been created in this browser.</p>
        <div className="field">
          <label htmlFor="pool">Pool address</label>
          <input id="pool" value={address} onChange={(event) => setAddress(event.target.value.trim())} placeholder="DBC virtual pool address" />
        </div>
        <Link className="button" href={address ? `/pool/${address}` : "/launches"}>Open desk</Link>
      </div>
      <div className="card-grid">
        {visible.length === 0 && (
          <article className="card">
            <h3>No confirmed launches on {network} yet</h3>
            <p>Create one from Launch. After both signatures confirm, the pool address shows up here. This list is only this browser. It is not a chain index, and an unconfirmed attempt is not saved.</p>
          </article>
        )}
        {visible.map((row) => (
          <article className="card" key={row.pool}>
            <h3>{row.name} · {row.symbol}</h3>
            <p className="fine mono">{shortKey(row.pool, 8)}</p>
            <p className="fine">{row.presetId} · {row.profile} · {row.quote}</p>
            <Link className="button" href={`/pool/${row.pool}`}>Open desk</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
