import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { listTemplates, saveTemplate, removeTemplate } from "../../src/lib/templates";
import { createEstimate, getEstimate, publish, publicView } from "../../src/lib/estimates";
const ids: string[] = [];
let a: string, b: string;
beforeAll(async () => {
  if (
    process.env.TEST_RUN !== "1" ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")
  )
    throw Error("Unsafe database");
  for (let i = 0; i < 2; i++) {
    const id = randomUUID();
    ids.push(id);
    const u = await db.user.create({
      data: { id, name: "Шаблоны", email: `${id}@example.test` },
      include: { workshop: true },
    });
    if (i === 0) a = u.workshop!.id;
    else b = u.workshop!.id;
  }
});
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
it("каталог изолирован; изменение и удаление шаблона не меняют опубликованную смету", async () => {
  const work = await saveTemplate(a, { name: "Чистка", quantity: 1, price: 180000 });
  expect(await listTemplates(b)).toEqual([]);
  await expect(
    saveTemplate(b, { name: "Чужая", quantity: 1, price: 1 }, work.id),
  ).rejects.toMatchObject({ status: 404 });
  await expect(removeTemplate(b, work.id)).rejects.toMatchObject({ status: 404 });
  await expect(saveTemplate(a, { name: "Чистка", quantity: 1, price: 20 })).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    saveTemplate(a, { name: "Отрицательная", quantity: 1, price: -1 }),
  ).rejects.toThrow();
  const e = await createEstimate(a, {
    clientName: "Тест",
    device: "Ноутбук",
    note: "Внутренняя",
    explanation: "Предлагаем чистку",
    completion: "Завтра",
    warranty: "Обсудить",
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ name: "Чистка", quantity: 1, price: 180000 }],
  });
  const { token } = await publish(a, e.id, e.versions[0].id);
  await saveTemplate(a, { name: "Чистка", quantity: 2, price: 250000 }, work.id);
  await removeTemplate(a, work.id);
  expect((await publicView(token)).total).toBe(180000);
  expect((await getEstimate(a, e.id)).versions[0].items[0].price).toBe(180000);
  expect(await listTemplates(a)).toEqual([]);
});
