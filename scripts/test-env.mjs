import "dotenv/config";
import { spawnSync } from "node:child_process";
export function testEnv(port = 3078) {
  const target = process.env.TEST_DATABASE_URL;
  if (!target) throw new Error("TEST_DATABASE_URL is required.");
  const test = new URL(target), main = new URL(process.env.DATABASE_URL);
  if (!test.pathname.endsWith("_test") || test.pathname === main.pathname || !["localhost", "127.0.0.1"].includes(test.hostname)) throw new Error("Test database must be local, different from production, and named *_test.");
  return { ...process.env, DATABASE_URL: target, BETTER_AUTH_URL: `http://localhost:${port}`, TEST_RUN: "1" };
}
export function run(file, args, env) { const result = spawnSync(process.execPath, [file, ...args], { env, stdio: "inherit" }); if (result.status !== 0) process.exit(result.status ?? 1); }
