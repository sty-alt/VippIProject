import { z } from "zod";
import { estimateSchema, itemSchema } from "./validation";
export const recoveryPrefix = "soglasovano:draft:";
const draftSchema = estimateSchema.extend({
  clientName: z.string().max(100),
  device: z.string().max(160),
  explanation: z.string().max(4000),
  completion: z.string().max(300),
  warranty: z.string().max(500),
  items: z
    .array(
      itemSchema.extend({ name: z.string().max(160), quantity: z.number().int().min(0).max(100) }),
    )
    .min(1)
    .max(30),
});
export const recoverySchema = z.object({
  form: draftSchema,
  savedAt: z.number(),
  base: z.string().max(32000),
});
export function readRecovery(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  now = Date.now(),
) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > 64000) {
      storage.removeItem(key);
      return null;
    }
    const parsed = recoverySchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.savedAt > now + 60000 ||
      now - parsed.data.savedAt > 86400000
    ) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
export function clearRecoveries(storage: Storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(recoveryPrefix)) storage.removeItem(key);
  }
}
