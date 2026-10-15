import { db } from "./db";
import { itemSchema } from "./validation";
import { AppError } from "./security";
export const listTemplates = (workshopId: string) =>
  db.serviceTemplate.findMany({ where: { workshopId }, orderBy: { name: "asc" } });
export async function saveTemplate(workshopId: string, input: unknown, id?: string) {
  const fields = itemSchema.parse(input);
  try {
    if (id) {
      const changed = await db.serviceTemplate.updateMany({
        where: { id, workshopId },
        data: fields,
      });
      if (!changed.count) throw new AppError("Шаблон недоступен.", 404);
      return { id };
    }
    return await db.serviceTemplate.create({ data: { ...fields, workshopId } });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002")
      throw new AppError("Работа с таким названием уже есть. Измените существующий шаблон.", 409);
    throw e;
  }
}
export async function removeTemplate(workshopId: string, id: string) {
  const result = await db.serviceTemplate.deleteMany({ where: { id, workshopId } });
  if (!result.count) throw new AppError("Шаблон недоступен.", 404);
  return { ok: true };
}
