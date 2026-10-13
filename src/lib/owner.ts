import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { AppError } from "./security";
export async function owner() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError("Войдите в аккаунт.", 401);
  return db.workshop.upsert({ where: { ownerId: session.user.id }, update: {}, create: { ownerId: session.user.id, name: session.user.name } });
}
