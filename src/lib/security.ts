import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL!).origin) throw new AppError("Запрос отклонён. Обновите страницу.", 403);
}
export async function readBody(request: Request) {
  const body = await request.text();
  if (Buffer.byteLength(body) > 32_000) throw new AppError("Слишком большой запрос.", 413);
  try { return JSON.parse(body); } catch { throw new AppError("Некорректный запрос."); }
}
export async function throttle(scope: string, subject: string, max: number, seconds = 60) {
  const key = hashToken(`${scope}:${subject}`);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "Throttle" ("key", "count", "expiresAt") VALUES (${key}, 1, NOW() + ${seconds} * interval '1 second')
    ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "Throttle"."expiresAt" <= NOW() THEN 1 ELSE "Throttle"."count" + 1 END,
    "expiresAt" = CASE WHEN "Throttle"."expiresAt" <= NOW() THEN NOW() + ${seconds} * interval '1 second' ELSE "Throttle"."expiresAt" END
    RETURNING "count"`;
  if (rows[0].count > max) throw new AppError("Слишком много запросов. Подождите минуту.", 429);
}
