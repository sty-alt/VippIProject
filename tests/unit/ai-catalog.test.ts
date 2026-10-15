import { afterAll, beforeAll, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { generateCatalogDraft, resolveCatalogDraft } from "../../src/lib/ai-catalog";
import { mergeReviewedCatalog } from "../../src/lib/reviewed-catalog";
const note = "На радиаторе пыль. Нужна чистка радиатора.";
const catalog = [{ id: "own-cleaning", name: "Чистка радиатора", quantity: 2, price: 180000 }];
const valid = {
  problem: "На радиаторе обнаружена пыль",
  works: "Предлагаем чистку радиатора",
  missing: [],
  selections: [{ catalogId: catalog[0].id, evidence: "Нужна чистка радиатора" }],
};
let received: Record<string, unknown>,
  base = "";
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const part of req) raw += part;
  received = JSON.parse(raw);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }));
});
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
it("получает структурный выбор через HTTP; цены/количество берёт из каталога и не отправляет модели", async () => {
  const result = await generateCatalogDraft({ note, works: [] }, catalog, {
    key: "test",
    base,
    model: "test",
  });
  expect(result.items).toEqual([
    {
      catalogId: catalog[0].id,
      evidence: valid.selections[0].evidence,
      name: catalog[0].name,
      quantity: 2,
      price: 180000,
    },
  ]);
  const request = JSON.stringify(received);
  expect(request).not.toContain("180000");
  const messages = received.messages as { content: string }[];
  const payload = JSON.parse(messages[1].content);
  expect(payload.catalog).toEqual([{ id: catalog[0].id, name: catalog[0].name }]);
  expect(payload).not.toHaveProperty("clientName");
});
it.each([
  { selections: [{ catalogId: "foreign-id", evidence: valid.selections[0].evidence }] },
  { selections: [valid.selections[0], valid.selections[0]] },
  { selections: [{ catalogId: catalog[0].id, evidence: "Придуманная цитата из заметки" }] },
  { selections: [{ ...valid.selections[0], price: 1 }] },
  { selections: [{ ...valid.selections[0], evidence: "пыль" }] },
  { works: "Чистка уже выполнена" },
  { problem: "Гарантия будет три месяца" },
])("отклоняет неподтверждённый, дублирующийся или опасный выбор %#", (patch) => {
  expect(() => resolveCatalogDraft({ ...valid, ...patch }, note, catalog, [])).toThrow();
});
it("не повторяет уже введённую работу", () => {
  expect(() => resolveCatalogDraft(valid, note, catalog, [" чистка  РАДИАТОРА "])).toThrow();
});
it("при отсутствии обоснования допускает пустой выбор и уточнения", () => {
  expect(
    resolveCatalogDraft(
      { ...valid, selections: [], missing: ["Уточнить решение мастера"] },
      note,
      catalog,
      [],
    ).items,
  ).toEqual([]);
});
it("пустой и слишком большой каталог не вызывают провайдера", async () => {
  await expect(generateCatalogDraft({ note, works: [] }, [])).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    generateCatalogDraft(
      { note, works: [] },
      Array.from({ length: 101 }, (_, i) => ({ ...catalog[0], id: String(i) })),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("не принимает каталог и цены от клиента", async () => {
  await expect(
    generateCatalogDraft({ note, works: [], catalog: [{ price: 1 }] }, catalog),
  ).rejects.toThrow();
});
it("перенос сохраняет ручную цену, заполняет пустую строку и требует актуальный каталог", () => {
  const proposal = resolveCatalogDraft(valid, note, catalog, []).items;
  const manual = { name: "Диагностика", price: 50000, quantity: 1 };
  expect(mergeReviewedCatalog([manual], proposal, catalog)).toEqual([
    manual,
    { name: catalog[0].name, price: 180000, quantity: 2 },
  ]);
  expect(
    mergeReviewedCatalog([{ name: "", price: 0, quantity: 1 }], proposal, catalog),
  ).toHaveLength(1);
  expect(() =>
    mergeReviewedCatalog([manual], proposal, [{ ...catalog[0], price: 250000 }]),
  ).toThrow("Каталог изменился");
  expect(() => mergeReviewedCatalog([manual], proposal, [])).toThrow("Каталог изменился");
  expect(() => mergeReviewedCatalog([catalog[0]], proposal, catalog)).toThrow("уже добавлена");
});
