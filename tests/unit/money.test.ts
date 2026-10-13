import { describe, it, expect } from "vitest";
import { calculateTotal, estimateSchema } from "../../src/lib/validation";
describe("Целые суммы", () => {
  it("считает точную сумму", () =>
    expect(
      calculateTotal([
        { name: "Чистка", quantity: 1, price: 180000 },
        { name: "Кулер", quantity: 2, price: 220000 },
      ]),
    ).toBe(620000));
  it.each([-1, 0.5, NaN, Infinity, 100000001])("отклоняет цену %s", (price) =>
    expect(() => calculateTotal([{ name: "Работа", quantity: 1, price }])).toThrow(),
  );
  it.each([0, -1, 0.5, 101])("отклоняет количество %s", (quantity) =>
    expect(() => calculateTotal([{ name: "Работа", quantity, price: 1 }])).toThrow(),
  );
  it("отклоняет переполнение итоговой границы", () =>
    expect(() => calculateTotal([{ name: "Работа", quantity: 100, price: 100000000 }])).toThrow());
  it("проверяет число строк", () => {
    expect(() => calculateTotal([])).toThrow();
    expect(() =>
      calculateTotal(Array.from({ length: 31 }, () => ({ name: "Работа", quantity: 1, price: 1 }))),
    ).toThrow();
  });
  it("не принимает недопустимую дату", () =>
    expect(() => estimateSchema.parse({ validUntil: "tomorrow" })).toThrow());
});
