import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { AppError } from "./security";
export async function owner() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError("Войдите в аккаунт.", 401);
  const workshop = await db.workshop.findUnique({ where: { ownerId: session.user.id } });
  if (!workshop) throw new AppError("Мастерская недоступна.", 403);
  return workshop;
}
