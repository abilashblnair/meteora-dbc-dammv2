"use client";

import { useNetwork } from "@/components/Providers";
import { shortKey } from "@/lib/format";
import { readLaunches, type LaunchRecord } from "@/lib/storage";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function isAddress(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function LaunchBook() {
  const { network } = useNetwork();
  const router = useRouter();
  const [rows, setRows] = useState<LaunchRecord[]>([]);
  const [address, setAddress] = useState("");
  const valid = isAddress(address);

  useEffect(() => {
    setRows(readLaunches());
  }, []);

  const visible = rows.filter((row) => row.network === network);

  return (
    <div className="book">
      <form
        className="paper open-pool"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) router.push(`/pool/${address}`);
        }}
      >
        <div>
          <h2>Open any pool</h2>
          <p className="fine">Paste a DBC virtual pool address on {network}. It does not need to have been created in this browser.</p>
        </div>
        <div className="inline-field">
          <label className="sr-only" htmlFor="pool">Pool address</label>
          <input
            id="pool"
            value={address}
            onChange={(event) => setAddress(event.target.value.trim())}
            placeholder="DBC virtual pool address"
            spellCheck={false}
            aria-invalid={address.length > 0 && !valid}
          />
          <button className="button" type="submit" disabled={!valid}>Open desk</button>
        </div>
        {address.length > 0 && !valid && <p className="fine field-error">That is not a valid Solana address.</p>}
      </form>

      <div className="section-head">
        <div>
          <p className="kicker">This browser · {network}</p>
          <h2>Your launches</h2>
        </div>
        <Link className="button-secondary" href="/launch">New listing</Link>
      </div>
      {visible.length === 0 ? (
        <div className="empty-card">
          <h3>No confirmed launches on {network} yet</h3>
          <p>
            After both launch signatures confirm, the pool shows up here. This list lives in this browser only. It is not a
            chain index, and an unconfirmed attempt is never saved.
          </p>
          <Link className="button" href="/launch">Create a listing</Link>
        </div>
      ) : (
        <div className="card-grid">
          {visible.map((row) => (
            <article className="card launch-card" key={row.pool}>
              <div className="tags">
                <span className="tag shape">{row.presetId}</span>
                <span className="tag subtle">{row.profile}</span>
                <span className="tag subtle">{row.quote}</span>
              </div>
              <h3>{row.name} <span className="symbol">{row.symbol}</span></h3>
              <p className="fine mono">{shortKey(row.pool, 8)}</p>
              <p className="fine">Created {new Date(row.createdAt).toLocaleString()}</p>
              <Link className="button-secondary block" href={`/pool/${row.pool}`}>Open desk →</Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
