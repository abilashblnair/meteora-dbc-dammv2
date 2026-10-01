import { LaunchBook } from "@/components/LaunchBook";

export default function LaunchesPage() {
  return (
    <div className="section">
      <p className="kicker">Book</p>
      <h1>Launches on this desk</h1>
      <p className="lede">
        Addresses saved in this browser after a confirmed pool transaction, plus a field for any other DBC pool.
      </p>
      <LaunchBook />
    </div>
  );
}
