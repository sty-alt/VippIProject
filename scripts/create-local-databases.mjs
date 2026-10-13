import "dotenv/config";
import pg from "pg";
const target = new URL(process.env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "55477" ||
  target.pathname !== "/soglasovano"
)
  throw new Error("This helper only creates databases in the project local cluster on port 55477.");
target.pathname = "/postgres";
const client = new pg.Client({ connectionString: target.toString() });
try {
  await client.connect();
  for (const name of ["soglasovano", "soglasovano_test"]) {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]);
    if (!result.rowCount) await client.query(`CREATE DATABASE ${name}`);
  }
  console.log("Local PostgreSQL databases ready.");
} catch {
  console.error("Could not initialize local databases; check .env and PostgreSQL.");
  process.exitCode = 1;
} finally {
  await client.end();
}
