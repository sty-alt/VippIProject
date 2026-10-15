import { owner } from "@/lib/owner";
import { db } from "@/lib/db";
import { AppError, checkOrigin, readBody, throttle, hashToken } from "@/lib/security";
import {
  createEstimate,
  getEstimate,
  updateDraft,
  cloneDraft,
  publish,
  manageLink,
  answerQuestion,
  publicView,
  publicAction,
  status,
  versionInclude,
} from "@/lib/estimates";
import { generateExplanation } from "@/lib/ai";
import { draftFromCatalog } from "@/lib/ai-catalog-service";
import { listTemplates, saveTemplate, removeTemplate } from "@/lib/templates";
import { z } from "zod";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function error(e: unknown) {
  if (e instanceof z.ZodError)
    return json(
      {
        error:
          "Проверьте поля: " +
          e.issues
            .map((i) => i.path.join("."))
            .slice(0, 5)
            .join(", "),
      },
      400,
    );
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof RangeError) return json({ error: e.message }, 400);
  return json(
    { error: "Не удалось выполнить действие. Проверьте данные и доступность базы." },
    500,
  );
}
export async function GET(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path[0] === "public" && path.length === 2) return json(await publicView(path[1]));
    const workshop = await owner();
    if (path[0] === "workshop")
      return json({
        workshop: { id: workshop.id, name: workshop.name },
        aiEnabled: !!process.env.AI_API_KEY && !!process.env.AI_MODEL,
      });
    if (path[0] === "templates" && path.length === 1) return json(await listTemplates(workshop.id));
    if (path[0] === "estimates" && path.length === 1) {
      const estimates = await db.estimate.findMany({
        where: { workshopId: workshop.id },
        orderBy: { createdAt: "desc" },
        include: { versions: { orderBy: { number: "desc" }, include: versionInclude } },
      });
      return json(
        estimates.map((e) => {
          const v = e.versions.find((v) => v.id === e.currentVersionId) ?? e.versions[0];
          return {
            id: e.id,
            number: e.number,
            device: v.device,
            clientName: v.clientName,
            total: v.total,
            createdAt: e.createdAt,
            status: status(v),
            hasDraft: !!e.currentVersionId && e.versions.some((v) => !v.publishedAt),
            hasQuestion: v.questions.some((q) => !q.answeredAt),
          };
        }),
      );
    }
    if (path[0] === "estimates" && path.length === 2) {
      const estimate = await getEstimate(workshop.id, path[1]);
      // Link hashes are never needed by the owner browser either.
      return json({
        ...estimate,
        versions: estimate.versions.map((v) => ({ ...v, links: undefined, status: status(v) })),
      });
    }
    throw new AppError("Страница недоступна.", 404);
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { path } = await context.params;
    const body = await readBody(request);
    if (path[0] === "public" && path.length === 2) {
      await throttle("public", hashToken(path[1]), 12);
      return json(await publicAction(path[1], body));
    }
    const workshop = await owner();
    if (path[0] === "templates") {
      if (path.length === 1) return json(await saveTemplate(workshop.id, body), 201);
      if (path.length === 3 && path[2] === "save")
        return json(await saveTemplate(workshop.id, body, path[1]));
      if (path.length === 3 && path[2] === "delete")
        return json(await removeTemplate(workshop.id, path[1]));
      throw new AppError("Действие недоступно.", 404);
    }
    if (path[0] === "ai" && path.length === 2 && path[1] === "catalog") {
      await throttle("ai", workshop.id, 5);
      return json(await draftFromCatalog(workshop.id, body));
    }
    if (path[0] === "ai" && path.length === 1) {
      await throttle("ai", workshop.id, 5);
      return json(await generateExplanation(body));
    }
    if (path[0] === "estimates" && path.length === 1)
      return json(await createEstimate(workshop.id, body), 201);
    if (path[0] === "estimates" && path.length === 3) {
      const id = path[1];
      switch (path[2]) {
        case "save":
          return json(
            await updateDraft(workshop.id, id, z.string().parse(body.versionId), body.input),
          );
        case "clone":
          return json(await cloneDraft(workshop.id, id));
        case "publish":
          return json(await publish(workshop.id, id, z.string().parse(body.versionId)));
        case "revoke":
          return json(await manageLink(workshop.id, id, "revoke"));
        case "reissue":
          return json(await manageLink(workshop.id, id, "reissue"));
        case "answer":
          await answerQuestion(workshop.id, id, z.string().parse(body.questionId), body.answer);
          return json({ ok: true });
      }
    }
    throw new AppError("Действие недоступно.", 404);
  } catch (e) {
    return error(e);
  }
}
