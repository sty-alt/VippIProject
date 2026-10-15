import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { mkdir } from "node:fs/promises";
const userEmails: string[] = [];
const input = {
  clientName: "Тестовый Азиз",
  device: "ASUS X515",
  note: "Внутренняя заметка не для клиента",
  explanation: "Кулер шумит. Предлагаем очистить систему охлаждения и заменить кулер.",
  completion: "Завтра до вечера",
  warranty: "На кулер — три месяца",
  validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
  items: [
    { name: "Чистка", quantity: 1, price: 180000 },
    { name: "Замена кулера", quantity: 1, price: 220000 },
  ],
};
test.beforeAll(async () => {
  if (
    process.env.TEST_RUN !== "1" ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")
  )
    throw new Error("Unsafe test target");
  await mkdir("test-results/screenshots", { recursive: true });
});
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: userEmails } } });
  await db.$disconnect();
});
test("Регистрация → ручная смета → публикация → согласование → кабинет; вопрос, ответ, новая версия", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `${randomUUID()}@example.test`;
  userEmails.push(email);
  await page.goto("/");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Первый раз здесь? Создать аккаунт" }).click();
  await page.getByLabel("Название мастерской").fill("ТехноМастер · демо");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("TestPassword-Only!45");
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваши сметы" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Здесь начнётся первый ремонт" })).toBeVisible();
  await page.getByRole("link", { name: "＋ Создать смету", exact: true }).click();
  await page.getByLabel("Имя клиента").fill(input.clientName);
  await page.getByLabel("Устройство", { exact: true }).fill(input.device);
  await page.getByLabel("Заметка мастера", { exact: false }).fill(input.note);
  await expect(page.getByRole("button", { name: /Сформировать AI-черновик/ })).toBeDisabled();
  await page.getByLabel("Объяснение для клиента").fill(input.explanation);
  await page.getByLabel("Название", { exact: true }).first().fill("Чистка");
  await page.getByLabel("Цена, сум", { exact: true }).first().fill("180000");
  await page.getByRole("button", { name: "＋ Добавить позицию" }).click();
  await page.getByLabel("Название", { exact: true }).nth(1).fill("Замена кулера");
  await page.getByLabel("Цена, сум", { exact: true }).nth(1).fill("220000");
  await page.getByLabel("Срок выполнения", { exact: true }).fill(input.completion);
  await page.getByLabel("Условия гарантии").fill(input.warranty);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("navigation").getByRole("link", { name: /Сметы/ }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByLabel("Устройство", { exact: true })).toHaveValue(input.device);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/screenshots/editor-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Предпросмотр для клиента" }).click();
  await expect(
    page.getByText("Клиентская ссылка ещё не выпущена.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть предпросмотр" }).click();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page).toHaveURL(/\/estimates\//);
  const id = page.url().split("/").pop()!;
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  const linkField = page.getByLabel("Ссылка для клиента", { exact: true });
  await expect(linkField).toBeVisible();
  const link = await linkField.inputValue();
  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const client = await clientContext.newPage();
  const response = await client.goto(link);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(client.getByRole("heading", { name: "ASUS X515" })).toBeVisible();
  await expect(client.getByText(input.note)).toHaveCount(0);
  await client.getByRole("button", { name: "Согласовать ремонт", exact: true }).click();
  await expect(client.getByRole("button", { name: "Подтвердить согласование" })).toBeDisabled();
  await client.getByRole("checkbox").check();
  await client.getByRole("button", { name: "Подтвердить согласование" }).click();
  await expect(client.getByText("Вы согласовали ремонт", { exact: true })).toBeVisible();
  await expect(client.getByRole("button", { name: "Отказаться", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Обновить ответы" }).click();
  await expect(page.getByText("Согласовано", { exact: true }).last()).toBeVisible();
  // New draft leaves old conditions and decision active until it is published.
  await page.getByRole("button", { name: "Создать новую версию" }).click();
  await expect(page.getByRole("heading", { name: "Черновик · версия 2" })).toBeVisible();
  await page.getByLabel("Цена, сум", { exact: true }).nth(1).fill("250000");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(linkField).toBeVisible();
  await expect.poll(async () => (await linkField.inputValue()) !== link).toBe(true);
  const newLink = await linkField.inputValue();
  expect(newLink !== link).toBe(true);
  await client.reload();
  await expect(client.getByText("Заменена новой версией", { exact: true })).toBeVisible();
  await expect(client.getByText("Вы согласовали ремонт", { exact: true })).toBeVisible();
  await client.goto(newLink);
  await client.getByRole("button", { name: "Задать вопрос", exact: true }).click();
  await client.getByLabel("Вопрос", { exact: true }).fill("Кулер будет новым?");
  await client.getByRole("button", { name: "Отправить вопрос" }).click();
  await expect(client.getByText("Требуется уточнение", { exact: true })).toBeVisible();
  await expect(client.getByRole("button", { name: "Согласовать ремонт", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Обновить ответы" }).click();
  await page.getByLabel("Ваш ответ").fill("Да, установим новый кулер.");
  await page.getByRole("button", { name: "Ответить клиенту" }).click();
  await expect(page.getByText("Да, установим новый кулер.", { exact: true })).toBeVisible();
  await client.getByRole("button", { name: "Обновить страницу" }).click();
  await expect(client.getByText("Да, установим новый кулер.", { exact: true })).toBeVisible();
  await expect(
    client.getByRole("button", { name: "Согласовать ремонт", exact: true }),
  ).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await client.setViewportSize({ width, height: 900 });
    expect(
      await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await client.screenshot({
      path: `test-results/screenshots/client-${width}.png`,
      fullPage: true,
    });
  }
  await client.getByRole("button", { name: "Отказаться", exact: true }).click();
  await client.getByRole("button", { name: "Подтвердить отказ" }).click();
  await expect(client.getByText("Вы отказались от ремонта", { exact: true })).toBeVisible();
  await clientContext.close();
  // Additional real persisted drafts with long text exercise table/card wrapping and search.
  for (const device of [
    "iPhone 13 · замена дисплея",
    "Samsung Galaxy A54",
    "Lenovo ThinkPad с длинным названием устройства для проверки переноса строки",
  ]) {
    const r = await page.request.post("/api/service/estimates", {
      headers: { Origin: "http://localhost:3078" },
      data: { ...input, device },
    });
    expect(r.status()).toBe(201);
  }
  await page.goto("/");
  await expect(page.locator(".estimate-row")).toHaveCount(4);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/screenshots/dashboard-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByPlaceholder("Номер, устройство или клиент").fill("Lenovo");
  await expect(page.locator(".estimate-row")).toHaveCount(1);
  await page.getByPlaceholder("Номер, устройство или клиент").fill("не существует");
  await expect(page.getByRole("heading", { name: "Сметы не найдены" })).toBeVisible();
  await page.goto(`/estimates/${id}`);
  await expect(page.locator(".badge.declined").first()).toBeVisible();
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Пароль", { exact: true }).fill("TestPassword-Only!45");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваши сметы" })).toBeVisible();
  expect(errors).toEqual([]);
});
test("HTTP: сессии, изоляция мастерских, CSRF, входные границы, публичный allowlist и rate limit", async ({
  playwright,
}) => {
  const contexts = [];
  for (const name of ["А", "Б"]) {
    const email = `${randomUUID()}@example.test`;
    userEmails.push(email);
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3078",
      // Model separate clients; the auth library also limits requests per client IP.
      extraHTTPHeaders: {
        Origin: "http://localhost:3078",
        "X-Forwarded-For": `192.0.2.${contexts.length + 10}`,
      },
    });
    contexts.push(ctx);
    const response = await ctx.post("/api/auth/sign-up/email", {
      data: { name: `Мастерская ${name}`, email, password: "TestPassword-Only!45" },
    });
    expect(response.status(), await response.text()).toBe(200);
    expect((await ctx.get("/api/service/workshop")).ok()).toBe(true);
  }
  const [a, b] = contexts;
  const template = await a.post("/api/service/templates", {
    data: { name: "Изолированная работа", quantity: 1, price: 180000 },
  });
  expect(template.status()).toBe(201);
  const templateId = (await template.json()).id;
  expect(await (await b.get("/api/service/templates")).json()).toEqual([]);
  expect((await b.post(`/api/service/templates/${templateId}/delete`, { data: {} })).status()).toBe(
    404,
  );
  expect(
    (
      await b.post(`/api/service/templates/${templateId}/save`, {
        data: { name: "Подмена", quantity: 1, price: 1 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await a.post("/api/service/templates", {
        headers: { Origin: "https://untrusted.example" },
        data: { name: "CSRF", quantity: 1, price: 1 },
      })
    ).status(),
  ).toBe(403);
  const created = await a.post("/api/service/estimates", { data: input });
  expect(created.status()).toBe(201);
  const e = await created.json();
  expect((await b.get(`/api/service/estimates/${e.id}`)).status()).toBe(404);
  expect(
    (
      await b.post(`/api/service/estimates/${e.id}/publish`, {
        data: { versionId: e.versions[0].id },
      })
    ).status(),
  ).toBe(404);
  expect(await (await b.get("/api/service/estimates")).json()).toEqual([]);
  expect(
    (
      await a.post("/api/service/estimates", {
        headers: { Origin: "https://untrusted.example" },
        data: input,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await a.post("/api/service/estimates", {
        data: { ...input, items: [{ name: "Неверно", price: -1, quantity: 1 }] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await a.post("/api/service/estimates", {
        data: { ...input, items: [{ name: "Слишком много", price: 100000000, quantity: 100 }] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await a.post("/api/service/ai", { data: { note: "Кулер шумит", works: ["Замена кулера"] } })
    ).status(),
  ).toBe(503);
  const publish = await a.post(`/api/service/estimates/${e.id}/publish`, {
    data: { versionId: e.versions[0].id },
  });
  expect(publish.ok()).toBe(true);
  const { token } = await publish.json();
  const guest = await playwright.request.newContext({
    baseURL: "http://localhost:3078",
    extraHTTPHeaders: { Origin: "http://localhost:3078" },
  });
  expect((await guest.get("/api/service/estimates")).status()).toBe(401);
  expect((await guest.get("/api/service/templates")).status()).toBe(401);
  expect(
    (
      await guest.post("/api/service/ai/catalog", { data: { note: "Нужна чистка", works: [] } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await a.post("/api/service/ai/catalog", {
        headers: { Origin: "https://untrusted.example" },
        data: { note: "Нужна чистка", works: [] },
      })
    ).status(),
  ).toBe(403);
  const view = await guest.get(`/api/service/public/${token}`);
  expect(view.headers()["cache-control"]).toContain("no-store");
  const publicJSON = JSON.stringify(await view.json());
  expect(publicJSON.includes(input.note)).toBe(false);
  expect(publicJSON.includes("tokenHash")).toBe(false);
  expect(publicJSON.includes("ownerId")).toBe(false);
  for (let i = 0; i < 12; i++) {
    const r = await guest.post(`/api/service/public/${token}`, {
      data: { action: "approved", accepted: false },
    });
    expect(r.status()).toBe(400);
  }
  expect(
    (
      await guest.post(`/api/service/public/${token}`, {
        data: { action: "approved", accepted: true },
      })
    ).status(),
  ).toBe(429);
  for (const ctx of [...contexts, guest]) await ctx.dispose();
});
