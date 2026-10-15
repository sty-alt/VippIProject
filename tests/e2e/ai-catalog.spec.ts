import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
const emails: string[] = [];
test.afterAll(async () => {
  if (
    process.env.TEST_RUN !== "1" ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")
  )
    throw Error("Unsafe target");
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});
test("AI-каталог: проверка мастером, устаревание, новый прайс и сохранение ручной цены", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "192.0.2.42" });
  const email = `${randomUUID()}@example.test`;
  emails.push(email);
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3078", "X-Forwarded-For": "192.0.2.42" },
    data: { name: "AI-каталог · тест", email, password: "TestPassword-Only!45" },
  });
  expect(signup.ok()).toBe(true);
  const created = await page.request.post("/api/service/templates", {
    headers: { Origin: "http://localhost:3078" },
    data: { name: "Чистка радиатора", quantity: 1, price: 180000 },
  });
  const work = await created.json();
  expect(created.status()).toBe(201);
  // Explicit UI fixture: real provider quality is not claimed by this browser test.
  await page.route("**/api/service/workshop", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), aiEnabled: true } });
  });
  let price = 180000;
  await page.route("**/api/service/ai/catalog", (route) =>
    route.fulfill({
      json: {
        problem: "На радиаторе обнаружена пыль",
        works: "Предлагаем диагностику и чистку радиатора",
        missing: ["Уточнить модель устройства"],
        items: [
          {
            catalogId: work.id,
            name: work.name,
            quantity: 1,
            price,
            evidence: "Нужна чистка радиатора",
          },
        ],
      },
    }),
  );
  await page.goto("/new");
  await page.getByLabel("Имя клиента").fill("Вымышленный клиент");
  await page.getByLabel("Устройство", { exact: true }).fill("Тестовый ноутбук");
  await page.getByLabel("Название", { exact: true }).fill("Диагностика");
  await page.getByLabel("Цена, сум", { exact: true }).fill("50000");
  const note = page.getByLabel("Заметка мастера", { exact: false });
  await note.fill("Пыль на радиаторе. Нужна чистка радиатора.");
  const generate = page.getByRole("button", { name: "Подобрать работы из каталога с AI" });
  const apply = page.getByRole("button", { name: "Перенести проверенные работы и объяснение" });
  const reviewed = page.getByRole("checkbox", {
    name: "Проверил работы, цены, основания и объяснение",
  });
  await generate.click();
  await expect(apply).toBeDisabled();
  await expect(page.getByLabel("Название", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Объяснение для клиента")).toHaveValue("");
  await reviewed.check();
  await expect(apply).toBeEnabled();
  await note.fill("Пыль на радиаторе. Нужна чистка радиатора. Уточнение мастера.");
  await expect(apply).toBeDisabled();
  await expect(
    page.getByText("Заметка или перечень работ изменились.", { exact: false }),
  ).toBeVisible();
  await generate.click();
  await reviewed.check();
  const updated = await page.request.post(`/api/service/templates/${work.id}/save`, {
    headers: { Origin: "http://localhost:3078" },
    data: { name: work.name, quantity: 1, price: 250000 },
  });
  expect(updated.ok()).toBe(true);
  await apply.click();
  await expect(page.getByRole("alert").filter({ hasText: "Каталог изменился" })).toBeVisible();
  await expect(page.getByLabel("Цена, сум", { exact: true })).toHaveValue("50000");
  price = 250000;
  await generate.click();
  await reviewed.check();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page
    .locator(".catalog-assistant")
    .screenshot({ path: "test-results/screenshots/ai-catalog.png" });
  let release: (() => void) | undefined;
  await page.route("**/api/service/templates", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await apply.click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByLabel("Цена, сум", { exact: true }).fill("60000");
  await expect(page.getByLabel("Цена, сум", { exact: true })).toHaveValue("60000");
  release!();
  await expect(page.getByRole("alert").filter({ hasText: "Форма изменилась" })).toBeVisible();
  await page.unroute("**/api/service/templates");
  await apply.click();
  await expect(page.getByLabel("Название", { exact: true })).toHaveCount(2);
  await expect(page.getByLabel("Цена, сум", { exact: true }).first()).toHaveValue("60000");
  await expect(page.getByLabel("Цена, сум", { exact: true }).nth(1)).toHaveValue("250000");
  await expect(page.getByLabel("Имя клиента")).toHaveValue("Вымышленный клиент");
  await expect(page.getByLabel("Устройство", { exact: true })).toHaveValue("Тестовый ноутбук");
  await expect(page.getByLabel("Объяснение для клиента")).toHaveValue(/Предлагаем диагностику/);
  expect(errors).toEqual([]);
});
