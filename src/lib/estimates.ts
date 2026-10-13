import { db } from "./db";
import type { Prisma } from "../generated/prisma/client";
import { calculateTotal, estimateSchema, textSchema } from "./validation";
import { AppError, hashToken, newToken } from "./security";
import type { Status } from "./locale";
type Tx = Prisma.TransactionClient;
export const versionInclude = { items: { orderBy: { position: "asc" as const } }, questions: { orderBy: { createdAt: "asc" as const } }, decision: true, links: true, events: { orderBy: { createdAt: "desc" as const } } };
export type FullVersion = Prisma.VersionGetPayload<{ include: typeof versionInclude }>;
export function status(v: FullVersion, now = new Date()): Status {
  if (!v.publishedAt) return "draft";
  if (v.replacedAt) return "replaced";
  if (v.decision) return v.decision.outcome === "approved" ? "approved" : "declined";
  if (!v.links.some(l => !l.revokedAt)) return "revoked";
  if (v.validUntil <= now) return "expired";
  if (v.questions.some(q => !q.answeredAt)) return "clarification";
  return "waiting";
}
async function lock(tx: Tx, estimateId: string, workshopId?: string) {
  await tx.$queryRaw`SELECT id FROM "Estimate" WHERE id = ${estimateId} FOR UPDATE`;
  const estimate = await tx.estimate.findUnique({ where: { id: estimateId } });
  if (!estimate || (workshopId && estimate.workshopId !== workshopId)) throw new AppError("Смета недоступна.", 404);
  return estimate;
}
const event = (tx: Tx, versionId: string, type: string) => tx.event.create({ data: { versionId, type } });
function data(input: unknown) {
  const parsed = estimateSchema.parse(input);
  const { items, validUntil, ...fields } = parsed;
  return { ...fields, validUntil: new Date(validUntil), total: calculateTotal(items), items: { create: items.map((item, position) => ({ ...item, position })) } };
}
export async function createEstimate(workshopId: string, input: unknown) {
  return db.estimate.create({ data: { workshopId, versions: { create: { ...data(input), number: 1 } } }, include: { versions: true } });
}
export async function getEstimate(workshopId: string, id: string) {
  const estimate = await db.estimate.findFirst({ where: { id, workshopId }, include: { versions: { orderBy: { number: "desc" }, include: versionInclude } } });
  if (!estimate) throw new AppError("Смета недоступна.", 404);
  return estimate;
}
export async function updateDraft(workshopId: string, id: string, versionId: string, input: unknown) {
  const fields = data(input);
  return db.$transaction(async tx => {
    await lock(tx, id, workshopId);
    const version = await tx.version.findFirst({ where: { id: versionId, estimateId: id, publishedAt: null } });
    if (!version) throw new AppError("Опубликованные условия неизменяемы. Создайте новую версию.", 409);
    await tx.item.deleteMany({ where: { versionId } });
    return tx.version.update({ where: { id: versionId }, data: fields });
  });
}
export async function cloneDraft(workshopId: string, id: string) {
  return db.$transaction(async tx => {
    const estimate = await lock(tx, id, workshopId);
    const existing = await tx.version.findFirst({ where: { estimateId: id, publishedAt: null } });
    if (existing) return existing;
    const current = await tx.version.findFirst({ where: { id: estimate.currentVersionId ?? "", estimateId: id }, include: { items: true } });
    if (!current) throw new AppError("Нет опубликованной версии.");
    const { clientName, device, note, explanation, completion, warranty } = current;
    return tx.version.create({ data: { estimateId: id, number: current.number + 1, ...data({ clientName, device, note, explanation, completion, warranty, validUntil: new Date(Date.now() + 7 * 86400000).toISOString(), items: current.items.map(({ name, quantity, price }) => ({ name, quantity, price })) }) } });
  });
}
export async function publish(workshopId: string, id: string, versionId: string) {
  return db.$transaction(async tx => {
    const estimate = await lock(tx, id, workshopId);
    const v = await tx.version.findFirst({ where: { id: versionId, estimateId: id, publishedAt: null }, include: { items: true } });
    if (!v) throw new AppError("Версия уже опубликована или недоступна.", 409);
    if (v.validUntil <= new Date()) throw new AppError("Установите будущий срок действия.");
    const now = new Date();
    if (estimate.currentVersionId) {
      await tx.version.update({ where: { id: estimate.currentVersionId }, data: { replacedAt: now } });
      await event(tx, estimate.currentVersionId, "replaced");
    }
    await tx.version.update({ where: { id: v.id }, data: { publishedAt: now, total: calculateTotal(v.items) } });
    await tx.estimate.update({ where: { id }, data: { currentVersionId: v.id } });
    const token = newToken();
    await tx.publicLink.create({ data: { versionId: v.id, tokenHash: hashToken(token) } });
    await event(tx, v.id, "published");
    return { token, versionId: v.id };
  });
}
export async function manageLink(workshopId: string, id: string, action: "revoke" | "reissue") {
  return db.$transaction(async tx => {
    const estimate = await lock(tx, id, workshopId);
    if (!estimate.currentVersionId) throw new AppError("Сначала опубликуйте смету.");
    const versionId = estimate.currentVersionId;
    await tx.publicLink.updateMany({ where: { versionId, revokedAt: null }, data: { revokedAt: new Date() } });
    let token: string | undefined;
    if (action === "reissue") { token = newToken(); await tx.publicLink.create({ data: { versionId, tokenHash: hashToken(token) } }); }
    await event(tx, versionId, action === "revoke" ? "revoked" : "reissued");
    return { token };
  });
}
export async function answerQuestion(workshopId: string, id: string, questionId: string, answer: unknown) {
  const text = textSchema.parse(answer);
  return db.$transaction(async tx => {
    const estimate = await lock(tx, id, workshopId);
    const q = await tx.question.findFirst({ where: { id: questionId, version: { estimateId: id } } });
    if (!q || q.answeredAt || q.versionId !== estimate.currentVersionId) throw new AppError("Вопрос недоступен для ответа.", 409);
    await tx.question.update({ where: { id: q.id }, data: { answer: text, answeredAt: new Date() } });
    await event(tx, q.versionId, "answered");
  });
}
export async function publicView(token: string) {
  if (!/^[\w-]{43}$/.test(token)) throw new AppError("Ссылка недоступна.", 404);
  const link = await db.publicLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { version: { include: { ...versionInclude, estimate: { include: { workshop: { select: { name: true } } } } } } } });
  if (!link) throw new AppError("Ссылка недоступна.", 404);
  const v = link.version;
  // Explicit allowlist: no internal note, account, link hashes, or service events.
  return { workshop: v.estimate.workshop.name, number: v.estimate.number, version: v.number, device: v.device, explanation: v.explanation, completion: v.completion, warranty: v.warranty, validUntil: v.validUntil, total: v.total, items: v.items.map(({ name, quantity, price }) => ({ name, quantity, price })), questions: v.questions.map(({ text, answer, createdAt, answeredAt }) => ({ text, answer, createdAt, answeredAt })), decision: v.decision ? { outcome: v.decision.outcome, createdAt: v.decision.createdAt } : null, status: status(v), available: !link.revokedAt && !!v.publishedAt && !v.replacedAt && v.validUntil > new Date() && !v.decision, revoked: !!link.revokedAt };
}
export async function publicAction(token: string, input: unknown) {
  const parsed = (await import("zod")).z.object({ action: (await import("zod")).z.enum(["approved", "declined", "question"]), text: textSchema.optional(), accepted: (await import("zod")).z.boolean().optional() }).parse(input);
  const hash = hashToken(token);
  const found = await db.publicLink.findUnique({ where: { tokenHash: hash }, include: { version: { select: { estimateId: true } } } });
  if (!found) throw new AppError("Ссылка недоступна.", 404);
  return db.$transaction(async tx => {
    const estimate = await lock(tx, found.version.estimateId);
    const link = await tx.publicLink.findUnique({ where: { tokenHash: hash }, include: { version: { include: versionInclude } } });
    if (!link) throw new AppError("Ссылка недоступна.", 404);
    const v = link.version;
    if (link.revokedAt || !v.publishedAt || v.replacedAt || estimate.currentVersionId !== v.id || v.validUntil <= new Date() || v.decision) throw new AppError("Эта версия больше не принимает ответы.", 409);
    if (v.questions.some(q => !q.answeredAt)) throw new AppError("Дождитесь ответа мастерской на ваш вопрос.", 409);
    if (parsed.action === "question") {
      const text = textSchema.parse(parsed.text);
      await tx.question.create({ data: { versionId: v.id, text } });
    } else {
      if (parsed.action === "approved" && !parsed.accepted) throw new AppError("Подтвердите ознакомление с условиями.");
      await tx.decision.create({ data: { versionId: v.id, outcome: parsed.action } });
    }
    await event(tx, v.id, parsed.action);
    return { ok: true };
  });
}
