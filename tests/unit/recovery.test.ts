import { describe, it, expect } from "vitest";
import { readRecovery, clearRecoveries, recoveryPrefix } from "../../src/lib/draft-recovery";
const form = {
  clientName: "",
  device: "Ноутбук",
  note: "Пыль",
  explanation: "",
  completion: "",
  warranty: "",
  validUntil: new Date().toISOString(),
  items: [{ name: "", quantity: 1, price: 0 }],
};
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
  };
};
describe("Восстановление незавершённого ввода", () => {
  it("возвращает неполный ввод только своего ключа", () => {
    const s = storage();
    s.setItem(`${recoveryPrefix}A:new`, JSON.stringify({ form, savedAt: 1000, base: "old" }));
    expect(readRecovery(s, `${recoveryPrefix}B:new`, 1001)).toBeNull();
    expect(readRecovery(s, `${recoveryPrefix}A:new`, 1001)?.form.device).toBe("Ноутбук");
  });
  it("не использует битую, истёкшую или неверную копию", () => {
    const s = storage();
    for (const value of [
      "broken",
      JSON.stringify({ form, savedAt: 0, base: "old" }),
      JSON.stringify({
        form: { ...form, items: [{ name: "x", price: -1, quantity: 1 }] },
        savedAt: 90000000,
        base: "x",
      }),
    ]) {
      s.setItem("x", value);
      expect(readRecovery(s, "x", 90000001)).toBeNull();
    }
  });
  it("выход удаляет все копии и сохраняет чужие настройки браузера", () => {
    const s = storage();
    s.setItem(recoveryPrefix + "A", "a");
    s.setItem(recoveryPrefix + "B", "b");
    s.setItem("other", "keep");
    clearRecoveries(s);
    expect(s.length).toBe(1);
    expect(s.getItem("other")).toBe("keep");
  });
});
