import { db } from "./db";
import { generateCatalogDraft } from "./ai-catalog";
import type { AIConfig } from "./ai";
export async function draftFromCatalog(workshopId: string, input: unknown, config?: AIConfig) {
  const catalog = await db.serviceTemplate.findMany({
    where: { workshopId },
    orderBy: { name: "asc" },
    take: 101,
    select: { id: true, name: true, price: true, quantity: true },
  });
  return generateCatalogDraft(input, catalog, config);
}
