import { calculateTotal, type EstimateInput } from "./validation";
type CatalogItem = EstimateInput["items"][number] & { catalogId: string };
export function mergeReviewedCatalog(
  current: EstimateInput["items"],
  proposal: CatalogItem[],
  latest: (EstimateInput["items"][number] & { id: string })[],
) {
  if (!proposal.length)
    throw Error("AI не подобрал работы. Уточните заметку или выберите позиции вручную.");
  const key = (name: string) => name.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  const ids = new Set<string>();
  const existing = new Set(current.map((item) => key(item.name)));
  for (const item of proposal) {
    const actual = latest.find((row) => row.id === item.catalogId);
    if (
      !actual ||
      actual.name !== item.name ||
      actual.price !== item.price ||
      actual.quantity !== item.quantity
    )
      throw Error(
        "Каталог изменился после генерации. Сформируйте новый черновик, чтобы проверить актуальные цены.",
      );
    if (ids.has(item.catalogId) || existing.has(key(item.name)))
      throw Error("Работа уже добавлена. Сформируйте черновик заново.");
    ids.add(item.catalogId);
    existing.add(key(item.name));
  }
  const untouched =
    current.length === 1 && !current[0].name && current[0].price === 0 && current[0].quantity === 1;
  const result = [
    ...(untouched ? [] : current),
    ...proposal.map(({ name, price, quantity }) => ({ name, price, quantity })),
  ];
  if (result.length > 30) throw Error("В смете может быть не больше 30 позиций.");
  calculateTotal(result);
  return result;
}
