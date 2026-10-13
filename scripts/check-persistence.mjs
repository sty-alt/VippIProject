import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=UTC",
});
try {
  await client.connect();
  const records = await client.query(
    `SELECT e.id, e.number, v.id AS version, v.total, v.device, v.explanation, v.completion, v.warranty,
    (SELECT COUNT(*) FROM "Item" i WHERE i."versionId"=v.id) AS items,
    (SELECT COUNT(*) FROM "Decision" d WHERE d."versionId"=v.id) AS decisions,
    (SELECT COUNT(*) FROM "Question" q WHERE q."versionId"=v.id) AS questions
    FROM "Estimate" e JOIN "Version" v ON v."estimateId"=e.id JOIN "Workshop" w ON w.id=e."workshopId"
    JOIN "User" u ON u.id=w."ownerId" WHERE u.email=$1 ORDER BY e.id, v.id`,
    [process.env.DEMO_EMAIL || "demo@soglasovano.example"],
  );
  if (!records.rowCount) throw new Error("Seed the demo first.");
  const fingerprint = createHash("sha256").update(JSON.stringify(records.rows)).digest("hex");
  if (process.argv.includes("--record")) {
    await writeFile(
      ".local/persistence-before.json",
      JSON.stringify({ fingerprint, versions: records.rowCount }),
    );
    console.log(`Recorded fingerprint for ${records.rowCount} persisted demo versions.`);
  } else {
    const before = JSON.parse(await readFile(".local/persistence-before.json", "utf8"));
    if (before.fingerprint !== fingerprint) throw new Error("Persistence mismatch");
    console.log(
      `PASS: ${records.rowCount} demo versions and associated records unchanged after restart.`,
    );
  }
} catch {
  console.error("Persistence verification failed; no business data logged.");
  process.exitCode = 1;
} finally {
  await client.end();
}
