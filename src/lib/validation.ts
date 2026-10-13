import { z } from "zod";
export const itemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(100),
  price: z.number().int().min(0).max(100_000_000),
});
export const estimateSchema = z.object({
  clientName: z.string().trim().min(1).max(100),
  device: z.string().trim().min(1).max(160),
  note: z.string().trim().max(4000),
  explanation: z.string().trim().min(1).max(4000),
  completion: z.string().trim().min(1).max(300),
  warranty: z.string().trim().min(1).max(500),
  validUntil: z.string().datetime({ offset: true }),
  items: z.array(itemSchema).min(1).max(30),
});
export type EstimateInput = z.infer<typeof estimateSchema>;
export function calculateTotal(items: z.infer<typeof itemSchema>[]) {
  z.array(itemSchema).min(1).max(30).parse(items);
  let total = 0;
  for (const item of items) {
    total += item.quantity * item.price;
    if (!Number.isSafeInteger(total) || total > 1_000_000_000)
      throw new RangeError("Сумма не может превышать 1 000 000 000 сум.");
  }
  return total;
}
export const textSchema = z.string().trim().min(1).max(2000);
