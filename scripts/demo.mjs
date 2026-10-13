import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const noOpen = process.argv.includes("--no-open");
const setupOnly = process.argv.includes("--setup-only");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32" && command === "npm.cmd",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Шаг завершился с кодом ${code}: ${command} ${args.join(" ")}`)),
    );
  });
const portOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
const openBrowser = () => {
  if (noOpen) return;
  const command =
    process.platform === "win32"
      ? "powershell.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32"
      ? ["-NoProfile", "-Command", "Start-Process 'http://localhost:3077'"]
      : ["http://localhost:3077"];
  const child = spawn(command, args, { stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
};
async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 22))
    throw new Error("Нужен Node.js 22.22 или новее: https://nodejs.org/");
  if (await portOpen(3077)) {
    try {
      const response = await fetch("http://localhost:3077/api/health", {
        signal: AbortSignal.timeout(2000),
      });
      const health = await response.json();
      if (health.product === "soglasovano" && health.database === "ok") {
        console.log("Согласовано уже запущено: http://localhost:3077");
        openBrowser();
        return;
      }
    } catch {
      /* Never stop an unknown server using this port. */
    }
    throw new Error(
      "Порт 3077 занят другим приложением. Оно не остановлено. Освободите порт и повторите запуск.",
    );
  }
  mkdirSync(".local", { recursive: true });
  const lockHash = createHash("sha256").update(readFileSync("package-lock.json")).digest("hex");
  const marker = ".local/demo-install.sha256";
  if (
    !existsSync("node_modules/next/package.json") ||
    !existsSync(marker) ||
    readFileSync(marker, "utf8") !== lockHash
  ) {
    console.log("1/5. Устанавливаем зависимости по lock-файлу…");
    await run(npm, ["ci"]);
    writeFileSync(marker, lockHash);
  }
  console.log("2/5. Готовим настройки и PostgreSQL…");
  await run(process.execPath, ["scripts/setup-env.mjs"]);
  process.loadEnvFile(".env");
  const url = new URL(process.env.DATABASE_URL);
  if (["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55477") {
    if (process.platform === "win32")
      await run("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "scripts/local-postgres.ps1",
      ]);
    else await run("docker", ["compose", "up", "-d", "--wait"]);
  }
  console.log("3/5. Применяем миграции…");
  await run(npm, ["run", "db:generate"]);
  await run(npm, ["run", "db:migrate"]);
  console.log("4/5. Готовим вымышленные демоданные без перезаписи существующих…");
  await run(npm, ["run", "db:seed"]);
  console.log("5/5. Собираем приложение…");
  await run(npm, ["run", "build"]);
  console.log("Готово. Демо-вход: .local/demo-credentials.json. Сервис: http://localhost:3077");
  if (setupOnly) return;
  const app = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3077", "--hostname", "127.0.0.1"],
    { stdio: "inherit" },
  );
  process.on("SIGINT", () => app.kill("SIGINT"));
  app.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch("http://localhost:3077/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok && (await r.json()).database === "ok") {
        openBrowser();
        break;
      }
    } catch {
      /* Wait for startup, without logging request details. */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await new Promise((resolve) =>
    app.once("exit", (code) => {
      if (code && code !== 130) process.exitCode = code;
      resolve();
    }),
  );
}
main().catch((e) => {
  console.error(
    `\nНе удалось запустить: ${e.message}\nПошаговая инструкция находится в README.md.`,
  );
  process.exitCode = 1;
});
