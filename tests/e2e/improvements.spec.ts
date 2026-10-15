import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
const emails: string[] = [];
test.afterAll(async () => {
  if (
    process.env.TEST_RUN !== "1" ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")
  )
    throw Error("Unsafe cleanup target");
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});
test("Свои цены, восстановление, устаревший AI, ошибка сети и приватная печать", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `${randomUUID()}@example.test`;
  emails.push(email);
  await page.goto("/");
  await page.getByRole("button", { name: "Первый раз здесь? Создать аккаунт" }).click();
  await page.getByLabel("Название мастерской").fill("Проверка улучшений");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("TestPassword-Only!45");
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваши сметы" })).toBeVisible();
  await page.getByRole("link", { name: "Мои работы и цены", exact: true }).click();
  await page.getByLabel("Название работы", { exact: true }).fill("Чистка радиатора");
  await page.getByLabel("Цена, сум", { exact: true }).fill("180000");
  await page.getByRole("button", { name: "Сохранить работу" }).click();
  await expect(page.getByText("Работа сохранена.", { exact: true })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: "test-results/screenshots/templates.png", fullPage: true });
  // The AI response is an explicit UI fixture. Live provider quality is evaluated separately.
  await page.route("**/api/service/workshop", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), aiEnabled: true } });
  });
  await page.reload();
  await page.getByRole("link", { name: /Новая смета/ }).click();
  const templateValue = await page
    .getByLabel("Из моих работ", { exact: true })
    .locator("option")
    .filter({ hasText: "Чистка радиатора" })
    .getAttribute("value");
  await page.getByLabel("Из моих работ", { exact: true }).selectOption(templateValue!);
  await page.getByRole("button", { name: "Добавить из моих работ" }).click();
  await expect(page.getByLabel("Цена, сум", { exact: true })).toHaveValue("180000");
  await page.getByLabel("Имя клиента").fill("Вымышленный клиент");
  await page.getByLabel("Устройство", { exact: true }).fill("Тестовый ноутбук");
  await page
    .getByLabel("Заметка мастера", { exact: false })
    .fill("Секретная внутренняя заметка: пыль на радиаторе");
  await page.getByLabel("Объяснение для клиента").fill("Предлагаем очистку радиатора.");
  await page.getByLabel("Срок выполнения", { exact: true }).fill("После согласования");
  await page.getByLabel("Условия гарантии").fill("Условия мастерской");
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(sessionStorage).filter((k) => k.startsWith("soglasovano:draft:")).length,
      ),
    )
    .toBe(1);
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.getByRole("button", { name: "Восстановить ввод", exact: true })).toBeVisible();
  await expect(page.getByLabel("Устройство", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Восстановить ввод", exact: true }).click();
  await expect(page.getByLabel("Устройство", { exact: true })).toHaveValue("Тестовый ноутбук");
  await page.route("**/api/service/ai", (route) =>
    route.fulfill({
      json: {
        problem: "На радиаторе обнаружена пыль.",
        works: "Предлагаем очистку радиатора.",
        missing: [],
      },
    }),
  );
  await page.getByRole("button", { name: "Сформировать AI-черновик" }).click();
  const transfer = page.getByRole("button", { name: "Перенести проверенный текст" });
  await expect(transfer).toBeEnabled();
  await page
    .getByLabel("Заметка мастера", { exact: false })
    .fill("Секретная внутренняя заметка: изменённые данные");
  await expect(transfer).toBeDisabled();
  await expect(page.getByText("Исходные данные изменились.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Объяснение для клиента")).toHaveValue(
    "Предлагаем очистку радиатора.",
  );
  // Network failure preserves manual text and local recovery; retry is a deliberate action.
  await page.route("**/api/service/estimates", (route) => route.abort());
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Нет связи с сервером" })).toBeVisible();
  await expect(page.getByLabel("Устройство", { exact: true })).toHaveValue("Тестовый ноутбук");
  await page.unroute("**/api/service/estimates");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page).toHaveURL(/\/estimates\//);
  expect(
    await page.evaluate(
      () => Object.keys(sessionStorage).filter((k) => k.startsWith("soglasovano:draft:")).length,
    ),
  ).toBe(0);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  const link = await page.getByLabel("Ссылка для клиента", { exact: true }).inputValue();
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await client.goto(link);
  await client.evaluate(() => {
    window.print = () => {};
  });
  await client.getByRole("button", { name: "Печать / PDF" }).click();
  const print = client.locator(".print-document");
  await expect(print).toHaveCount(1);
  expect(await print.textContent()).not.toContain("Секретная внутренняя");
  expect(await print.textContent()).not.toContain(link);
  await client.emulateMedia({ media: "print" });
  await expect(print).toBeVisible();
  await expect(print.getByRole("heading", { name: /версия 1/ })).toBeVisible();
  await client.screenshot({ path: "test-results/screenshots/print.png", fullPage: true });
  await client.pdf({
    path: "test-results/screenshots/estimate.pdf",
    format: "A4",
    displayHeaderFooter: false,
  });
  await clientContext.close();
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole("button", { name: "Печать / PDF" }).click();
  expect(await page.locator(".print-document").textContent()).not.toContain("Секретная внутренняя");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("afterprint"));
    sessionStorage.setItem("soglasovano:draft:foreign:new:new", "test");
  });
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  expect(
    await page.evaluate(
      () => Object.keys(sessionStorage).filter((k) => k.startsWith("soglasovano:draft:")).length,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});
