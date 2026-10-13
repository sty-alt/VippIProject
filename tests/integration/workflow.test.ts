import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  createEstimate,
  getEstimate,
  updateDraft,
  cloneDraft,
  publish,
  publicAction,
  publicView,
  answerQuestion,
  manageLink,
} from "../../src/lib/estimates";
const input = {
  clientName: "Азиз (тест)",
  device: "ASUS X515",
  note: "Секретная заметка",
  explanation: "Кулер шумит, нужна чистка и замена.",
  completion: "Завтра",
  warranty: "Три месяца",
  validUntil: new Date(Date.now() + 86400000).toISOString(),
  items: [
    { name: "Чистка", quantity: 1, price: 180000 },
    { name: "Кулер", quantity: 1, price: 220000 },
  ],
};
let a: string, b: string;
const users: string[] = [];
beforeAll(async () => {
  if (
    process.env.TEST_RUN !== "1" ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")
  )
    throw new Error("Unsafe test database");
  for (const name of ["A", "B"]) {
    const id = randomUUID();
    users.push(id);
    const u = await db.user.create({
      data: { id, name, email: `${id}@example.test` },
      include: { workshop: true },
    });
    if (name === "A") a = u.workshop!.id;
    else b = u.workshop!.id;
  }
});
// No destructive reset. Cascades remove only records belonging to this run's newly created users.
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
async function fixture() {
  const e = await createEstimate(a, input);
  const v = e.versions[0];
  const result = await publish(a, e.id, v.id);
  return { e, v, token: result.token };
}
describe("PostgreSQL жизненный цикл", () => {
  it("записывает время в UTC независимо от часового пояса сервера PostgreSQL", async () => {
    const rows = await db.$queryRaw<{ TimeZone: string }[]>`SHOW TIME ZONE`;
    expect(rows[0].TimeZone).toBe("UTC");
    const e = await createEstimate(a, input);
    expect(Math.abs(e.createdAt.getTime() - Date.now())).toBeLessThan(5000);
  });
  it("изолирует чтение, изменение, публикацию, ссылки, клонирование и ответы мастерских", async () => {
    const { e, v } = await fixture();
    await expect(getEstimate(b, e.id)).rejects.toThrow("недоступна");
    for (const action of [
      () => updateDraft(b, e.id, v.id, input),
      () => publish(b, e.id, v.id),
      () => cloneDraft(b, e.id),
      () => manageLink(b, e.id, "reissue"),
      () => answerQuestion(b, e.id, "x", "Ответ"),
    ])
      await expect(action()).rejects.toThrow("недоступна");
  });
  it("не доверяет присланному итогу и исключает внутренние поля из публичного ответа", async () => {
    const e = await createEstimate(a, { ...input, total: 1 });
    expect(e.versions[0].total).toBe(400000);
    const p = await publish(a, e.id, e.versions[0].id);
    const raw = JSON.stringify(await publicView(p.token));
    expect(raw).not.toContain("Секретная");
    expect(raw).not.toContain("tokenHash");
    expect(raw).not.toContain("ownerId");
  });
  it("разрешает только одно конкурентное решение", async () => {
    const { token, v } = await fixture();
    const results = await Promise.allSettled([
      publicAction(token, { action: "approved", accepted: true }),
      publicAction(token, { action: "declined" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.decision.count({ where: { versionId: v.id } })).toBe(1);
    await expect(publicAction(token, { action: "approved", accepted: true })).rejects.toThrow();
  });
  it("вопрос блокирует решение до ответа менеджера", async () => {
    const { e, token, v } = await fixture();
    await publicAction(token, { action: "question", text: "Кулер новый?" });
    expect((await publicView(token)).status).toBe("clarification");
    await expect(publicAction(token, { action: "approved", accepted: true })).rejects.toThrow(
      "Дождитесь",
    );
    const q = await db.question.findFirstOrThrow({ where: { versionId: v.id } });
    await answerQuestion(a, e.id, q.id, "Да, новый.");
    const view = await publicView(token);
    expect(view.status).toBe("waiting");
    expect(view.questions[0].answer).toBe("Да, новый.");
    await publicAction(token, { action: "approved", accepted: true });
    expect((await publicView(token)).status).toBe("approved");
  });
  it("старые условия и решение сохраняются при изменении цены", async () => {
    const { e, token, v } = await fixture();
    await publicAction(token, { action: "approved", accepted: true });
    const draft = await cloneDraft(a, e.id);
    const sameDraft = await cloneDraft(a, e.id);
    expect(sameDraft.id).toBe(draft.id);
    await updateDraft(a, e.id, draft.id, {
      ...input,
      items: [{ name: "Кулер", quantity: 1, price: 500000 }],
    });
    expect((await publicView(token)).status).toBe("approved");
    const next = await publish(a, e.id, draft.id);
    expect((await publicView(token)).status).toBe("replaced");
    expect((await publicView(token)).decision?.outcome).toBe("approved");
    expect((await publicView(next.token)).total).toBe(500000);
    expect((await publicView(token)).total).toBe(400000);
    await expect(publicAction(token, { action: "declined" })).rejects.toThrow();
    expect(await db.decision.count({ where: { versionId: v.id } })).toBe(1);
  });
  it("запрещает просроченные и отозванные ответы; перевыпуск отзывает прежний токен", async () => {
    const e = await createEstimate(a, {
      ...input,
      validUntil: new Date(Date.now() + 1000).toISOString(),
    });
    const p = await publish(a, e.id, e.versions[0].id);
    await new Promise((r) => setTimeout(r, 1100));
    await expect(publicAction(p.token, { action: "declined" })).rejects.toThrow();
    expect((await publicView(p.token)).status).toBe("expired");
    const f = await fixture();
    await manageLink(a, f.e.id, "revoke");
    await expect(publicAction(f.token, { action: "declined" })).rejects.toThrow();
    const newLink = await manageLink(a, f.e.id, "reissue");
    await expect(publicAction(f.token, { action: "approved", accepted: true })).rejects.toThrow();
    await publicAction(newLink.token!, { action: "declined" });
  });
  it("решение не исчезает после истечения срока и отзыва", async () => {
    const e = await createEstimate(a, {
      ...input,
      validUntil: new Date(Date.now() + 2000).toISOString(),
    });
    const p = await publish(a, e.id, e.versions[0].id);
    await publicAction(p.token, { action: "approved", accepted: true });
    await manageLink(a, e.id, "revoke");
    await new Promise((r) => setTimeout(r, 2100));
    expect((await publicView(p.token)).decision?.outcome).toBe("approved");
    expect((await publicView(p.token)).status).toBe("approved");
  });
  it("сериализует одновременную публикацию и решение согласно порядку блокировок", async () => {
    for (let i = 0; i < 6; i++) {
      const { e, token, v } = await fixture();
      const draft = await cloneDraft(a, e.id);
      const operations =
        i % 2
          ? [
              publish(a, e.id, draft.id),
              publicAction(token, { action: "approved", accepted: true }),
            ]
          : [
              publicAction(token, { action: "approved", accepted: true }),
              publish(a, e.id, draft.id),
            ];
      const results = await Promise.allSettled(operations);
      const reply = results[i % 2 ? 1 : 0],
        publication = results[i % 2 ? 0 : 1];
      expect(publication.status).toBe("fulfilled");
      const decisions = await db.decision.count({ where: { versionId: v.id } });
      expect(decisions).toBe(reply.status === "fulfilled" ? 1 : 0);
      expect((await publicView(token)).status).toBe("replaced");
    }
  });
  it("ограничения базы отклоняют второе решение и изменение опубликованных условий", async () => {
    const { v, token } = await fixture();
    await publicAction(token, { action: "declined" });
    await expect(
      db.decision.create({ data: { versionId: v.id, outcome: "approved" } }),
    ).rejects.toThrow();
    await expect(db.version.update({ where: { id: v.id }, data: { total: 1 } })).rejects.toThrow();
    await expect(
      db.item.updateMany({ where: { versionId: v.id }, data: { price: 1 } }),
    ).rejects.toThrow();
  });
});
