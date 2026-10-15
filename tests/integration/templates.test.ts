import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { listTemplates, saveTemplate, removeTemplate } from "../../src/lib/templates";
import { createEstimate, getEstimate, publish, publicView } from "../../src/lib/estimates";
import { draftFromCatalog } from "../../src/lib/ai-catalog-service";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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
it("AI получает только каталог своей мастерской; чужой ID и клиентский прайс отвергаются", async () => {
  const own = await saveTemplate(a, { name: "Чистка радиатора", price: 180000, quantity: 1 });
  const foreign = await saveTemplate(b, { name: "Чужая закрытая работа", price: 999, quantity: 1 });
  const note = "Обнаружена пыль, нужна чистка радиатора.";
  let selectId = own.id,
    payload = "",
    calls = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    calls++;
    payload = body;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                problem: "На радиаторе обнаружена пыль",
                works: "Предлагаем чистку радиатора",
                missing: [],
                selections: [{ catalogId: selectId, evidence: "нужна чистка радиатора" }],
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const config = {
    key: "fixture",
    model: "fixture",
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
  try {
    const result = await draftFromCatalog(a, { note, works: [] }, config);
    expect(result.items[0].price).toBe(180000);
    expect(payload).not.toContain("Чужая закрытая работа");
    expect(payload).not.toContain(foreign.id);
    expect(payload).not.toContain("180000");
    selectId = foreign.id;
    await expect(draftFromCatalog(a, { note, works: [] }, config)).rejects.toMatchObject({
      status: 502,
    });
    await expect(
      draftFromCatalog(a, { note, works: [], catalog: [{ id: foreign.id, price: 1 }] }, config),
    ).rejects.toThrow();
    expect(calls).toBe(2);
    expect(await db.estimate.count({ where: { workshopId: b } })).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
