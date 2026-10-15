import "dotenv/config";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, chmod, readFile, access } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  source = new URL(process.env.DATABASE_URL);
const drill = process.argv.includes("--verify-restore");
const keep = process.argv.includes("--keep");
if (drill && !["localhost", "127.0.0.1"].includes(source.hostname))
  throw new Error("Restore verification is restricted to a local PostgreSQL server.");
const dbName = decodeURIComponent(source.pathname.slice(1));
const temporary = `${dbName.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24)}_restore_${randomBytes(6).toString("hex")}`;
const folder = path.resolve(root, ".local", "backups");
await mkdir(folder, { recursive: true, mode: 0o700 });
const archive = path.join(
  folder,
  `soglasovano-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
);
const pool = new Pool({ connectionString: source.toString(), options: "-c timezone=UTC" });
const connection = await pool.connect();
let created = false,
  restored;
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
async function cli(name, args) {
  const bundled = path.join(root, ".local", "postgres", "pgsql", "bin", `${name}.exe`);
  const command = await access(bundled)
    .then(() => bundled)
    .catch(() => name);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        PGHOST: source.hostname,
        PGPORT: source.port || "5432",
        PGUSER: decodeURIComponent(source.username),
        PGPASSWORD: decodeURIComponent(source.password),
        PGSSLMODE: source.searchParams.get("sslmode") || "prefer",
      },
    });
    // Drain diagnostics without exposing connection details or customer data in logs.
    child.stderr.resume();
    child.once("error", () =>
      reject(
        new Error(
          `PostgreSQL client ${name} unavailable. Install PostgreSQL client tools or use START-DEMO.cmd on Windows.`,
        ),
      ),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${name} failed; backup/restore was not confirmed. Check server version and permissions.`,
            ),
          ),
    );
  });
}
async function fingerprints(client) {
  const tables = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const result = {};
  for (const { tablename } of tables.rows) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS count, md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text, '[]')) AS digest FROM ${quote(tablename)} r`,
    );
    result[tablename] = rows[0];
  }
  return result;
}
try {
  await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const { rows } = await connection.query("SELECT pg_export_snapshot() AS id");
  const expected = await fingerprints(connection);
  await cli("pg_dump", [
    "--dbname",
    dbName,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--snapshot",
    rows[0].id,
    "--file",
    archive,
  ]);
  await chmod(archive, 0o600);
  await connection.query("COMMIT");
  const hash = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  const report = {
    createdAt: new Date().toISOString(),
    archive: path.basename(archive),
    sha256: hash,
    verified: false,
    tables: Object.keys(expected).length,
  };
  if (drill) {
    if (!temporary.includes("_restore_") || temporary === dbName)
      throw new Error("Unsafe restore target");
    await connection.query(`CREATE DATABASE ${quote(temporary)} TEMPLATE template0`);
    created = true;
    await cli("pg_restore", [
      "--dbname",
      temporary,
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      archive,
    ]);
    const url = new URL(source);
    url.pathname = `/${temporary}`;
    restored = new Pool({ connectionString: url.toString(), options: "-c timezone=UTC" });
    const actual = await fingerprints(restored);
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new Error("Restored data fingerprint mismatch");
    report.verified = true;
    if (keep) report.restoreDatabase = temporary;
  }
  await writeFile(`${archive}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally {
  await connection.query("ROLLBACK").catch(() => {});
  await restored?.end();
  // Only the fresh database created by this invocation can be removed.
  if (created && !keep) await connection.query(`DROP DATABASE ${quote(temporary)}`);
  connection.release();
  await pool.end();
}
