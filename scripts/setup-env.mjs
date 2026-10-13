import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const file = ".env";
if (!existsSync(file)) {
  const password = randomBytes(24).toString("hex");
  const secret = randomBytes(48).toString("hex");
  writeFileSync(
    file,
    `DATABASE_URL=postgresql://soglasovano:${password}@localhost:55477/soglasovano\nTEST_DATABASE_URL=postgresql://soglasovano:${password}@localhost:55477/soglasovano_test\nPOSTGRES_PASSWORD=${password}\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:3077\nAI_API_KEY=\nAI_BASE_URL=https://openrouter.ai/api/v1\nAI_MODEL=liquid/lfm-2.5-2.6b:free\n`,
  );
}
process.loadEnvFile(file);
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.startsWith("replace-with-")) {
  const secret = randomBytes(48).toString("hex");
  let content = readFileSync(file, "utf8");
  content = /^BETTER_AUTH_SECRET=/m.test(content)
    ? content.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`)
    : content + `\nBETTER_AUTH_SECRET=${secret}\n`;
  writeFileSync(file, content);
}
const database = new URL(process.env.DATABASE_URL);
if (process.argv.includes("--local-cluster")) {
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.port !== "55477" ||
    database.username !== "soglasovano" ||
    database.pathname !== "/soglasovano" ||
    !database.password
  )
    throw new Error(
      "Local PostgreSQL requires the project URL on localhost:55477. Existing .env preserved.",
    );
  writeFileSync(".local/pg-password.txt", decodeURIComponent(database.password));
}
console.log("Настройки подготовлены. Секреты остаются в локальном .env.");
