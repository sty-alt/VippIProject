import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { generateExplanation, redact } from "../../src/lib/ai";
const input = { note: "Кулер шумит. email: test@example.com телефон +998 90 123 45 67", works: ["Чистка", "Замена кулера"] };
let mode = "good", received = "", base = "";
const server = createServer(async (req, res) => {
  received = ""; for await (const chunk of req) received += chunk;
  res.setHeader("Content-Type", "application/json");
  if (mode === "error") { res.writeHead(503); return res.end("{}"); }
  const output = mode === "invalid" ? { problem: "текст" } : mode === "financial" ? { problem: "Цена 200000 сум", works: "Замена", missing: [] } : { problem: "Кулер работает с шумом.", works: "Чистка удалит загрязнения, замена касается указанного кулера.", missing: ["Уточнить состояние креплений"] };
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
});
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
describe("HTTP AI адаптер", () => {
  it("валидирует настоящий HTTP ответ и удаляет очевидные идентификаторы", async () => { mode = "good"; const output = await generateExplanation(input, { key: "test-key", model: "test-model", base }); expect(output.problem).toContain("Кулер"); expect(received).not.toContain("test@example.com"); expect(received).not.toContain("+998"); expect(received).not.toContain("clientName"); });
  it.each(["invalid", "error", "financial"])("безопасно отклоняет %s", async value => { mode = value; await expect(generateExplanation(input, { key: "test", model: "test", base })).rejects.toThrow("вручную"); });
  it("без ключа оставляет ручной режим", async () => { await expect(generateExplanation(input, { key: "", model: "", base })).rejects.toThrow("вручную"); });
  it("удаляет email и телефон", () => { expect(redact(input.note)).not.toContain("test@example.com"); expect(redact(input.note)).not.toContain("123 45 67"); });
});
