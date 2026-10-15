import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { generateExplanation, redact, validateExplanation } from "../../src/lib/ai";
const input = {
  note: "Кулер шумит. email: test@example.com телефон +998 90 123 45 67",
  works: ["Чистка", "Замена кулера"],
};
let mode = "good",
  received = "",
  base = "";
const server = createServer(async (req, res) => {
  received = "";
  for await (const chunk of req) received += chunk;
  res.setHeader("Content-Type", "application/json");
  if (mode === "error") {
    res.writeHead(503);
    return res.end("{}");
  }
  if (/^\d{3}$/.test(mode)) {
    res.writeHead(Number(mode));
    return res.end('{"error":"private provider details"}');
  }
  const output =
    mode === "invalid"
      ? { problem: "текст" }
      : mode === "financial"
        ? { problem: "Цена 200000 сум", works: "Замена", missing: [] }
        : {
            problem: "Кулер работает с шумом.",
            works: "Чистка удалит загрязнения, замена касается указанного кулера.",
            missing: ["Уточнить состояние креплений"],
          };
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
});
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
describe("HTTP AI адаптер", () => {
  it.each([
    "Осмотр кулера проведен",
    "Проведена диагностика питания",
    "Кулер заменён",
    "Загрязнение устранено",
  ])("не выдаёт будущие работы за выполненные: %s", (works) => {
    expect(() =>
      validateExplanation({ problem: "Причина пока неизвестна", works, missing: [] }),
    ).toThrow();
  });
  it.each([
    ["401", 503],
    ["402", 503],
    ["429", 429],
    ["500", 503],
  ])("понятно обрабатывает провайдера %s", async (value, status) => {
    mode = value as string;
    await expect(
      generateExplanation(input, { key: "test", model: "test", base }),
    ).rejects.toMatchObject({ status });
  });
  it.each([
    "Цена двести тысяч сум",
    "Стоимость в рублях",
    "Гарантия три месяца",
    "Ремонт выполнен",
    "Скидка десять %",
    "Напишите owner@example.test",
    " ",
  ])("отклоняет опасный или пустой текст: %s", (text) => {
    expect(() =>
      validateExplanation({ problem: text, works: "Предлагаем очистку", missing: [] }),
    ).toThrow();
  });
  it("отправляет OpenRouter точную схему, сохраняя серверную проверку", async () => {
    mode = "good";
    const originalFetch = globalThis.fetch;
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, init) => originalFetch(`${base}/chat/completions`, init));
    try {
      await generateExplanation(input, {
        key: "test-key",
        model: "test-model",
        base: "https://openrouter.ai/api/v1",
      });
      const body = JSON.parse(received);
      expect(body.reasoning).toEqual({ effort: "minimal", exclude: true });
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.response_format.json_schema.schema.properties.works.type).toBe("string");
      expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
  it("валидирует настоящий HTTP ответ и удаляет очевидные идентификаторы", async () => {
    mode = "good";
    const output = await generateExplanation(input, { key: "test-key", model: "test-model", base });
    expect(output.problem).toContain("Кулер");
    expect(received).not.toContain("test@example.com");
    expect(received).not.toContain("+998");
    expect(received).not.toContain("clientName");
  });
  it.each(["invalid", "error", "financial"])("безопасно отклоняет %s", async (value) => {
    mode = value;
    await expect(generateExplanation(input, { key: "test", model: "test", base })).rejects.toThrow(
      "вручную",
    );
  });
  it("без ключа оставляет ручной режим", async () => {
    await expect(generateExplanation(input, { key: "", model: "", base })).rejects.toThrow(
      "вручную",
    );
  });
  it("удаляет email и телефон", () => {
    expect(redact(input.note)).not.toContain("test@example.com");
    expect(redact(input.note)).not.toContain("123 45 67");
  });
});
