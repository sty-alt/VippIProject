import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const dirs: string[] = [];
const script = path.resolve("scripts/setup-env.mjs");
const create = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "soglasovano-env-"));
  dirs.push(dir);
  return dir;
};
const run = (cwd: string) =>
  spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test" },
  });
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
describe("Безопасная подготовка запуска", () => {
  it("создаёт случайные секреты и связанные строки подключения", () => {
    const a = create(),
      b = create();
    expect(run(a).status).toBe(0);
    expect(run(b).status).toBe(0);
    const first = readFileSync(path.join(a, ".env"), "utf8"),
      second = readFileSync(path.join(b, ".env"), "utf8");
    expect(first).not.toBe(second);
    expect(first).toMatch(/BETTER_AUTH_SECRET=[a-f0-9]{96}/);
    expect(first).toContain("soglasovano_test");
    expect(first).not.toContain("replace-with-");
  });
  it("сохраняет существующие данные, AI-настройки и реальный секрет", () => {
    const dir = create();
    const content =
      "DATABASE_URL=postgresql://user:existing@localhost:55477/soglasovano\nBETTER_AUTH_SECRET=existing-secret-with-at-least-thirty-two-characters\nAI_MODEL=existing-model\n";
    writeFileSync(path.join(dir, ".env"), content);
    expect(run(dir).status).toBe(0);
    expect(readFileSync(path.join(dir, ".env"), "utf8")).toBe(content);
  });
});
