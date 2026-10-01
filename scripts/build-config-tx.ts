import { Connection, Keypair } from "@solana/web3.js";
import { buildConfigTransaction } from "../lib/meteora/actions";
import { getPreset } from "../lib/meteora/presets";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const preset = getPreset("listing-exponential");
  if (!preset) throw new Error("missing preset");
  const built = await buildConfigTransaction({
    connection,
    payer: Keypair.generate().publicKey,
    preset,
    quote: "USDC",
    profile: "sandbox",
    network: "devnet",
  });
  const programIds = built.transaction.instructions.map((instruction) => instruction.programId.toBase58());
  if (!programIds.includes("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN")) {
    throw new Error(`config transaction did not include the DBC program: ${programIds.join(",")}`);
  }
  console.log(
    JSON.stringify({
      instructions: built.transaction.instructions.length,
      config: built.configAddress.toBase58(),
      programs: programIds,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
