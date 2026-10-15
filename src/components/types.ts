import type { EstimateInput } from "@/lib/validation";
import type { Status } from "@/lib/locale";
export type Question = {
  id: string;
  text: string;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
};
export type Version = Omit<EstimateInput, "items"> & {
  id: string;
  number: number;
  total: number;
  publishedAt: string | null;
  replacedAt: string | null;
  createdAt: string;
  status: Status;
  items: (EstimateInput["items"][number] & { id: string })[];
  questions: Question[];
  decision: { outcome: string; createdAt: string } | null;
  events: { id: string; type: string; createdAt: string }[];
};
export type Estimate = {
  id: string;
  number: number;
  currentVersionId: string | null;
  versions: Version[];
};
export type Row = {
  id: string;
  number: number;
  device: string;
  clientName: string;
  total: number;
  createdAt: string;
  status: Status;
  hasDraft: boolean;
  hasQuestion: boolean;
};
export type ServiceTemplate = { id: string; name: string; price: number; quantity: number };
export type PublicEstimate = {
  workshop: string;
  number: number;
  version: number;
  device: string;
  explanation: string;
  completion: string;
  warranty: string;
  validUntil: string;
  total: number;
  items: EstimateInput["items"];
  questions: Omit<Question, "id">[];
  decision: { outcome: string; createdAt: string } | null;
  status: Status;
  available: boolean;
  revoked: boolean;
};
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/service/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("Нет связи с сервером. Проверьте подключение и повторите действие.");
  }
  const result = await response.json().catch(() => null);
  if (!result)
    throw new Error(
      "Сервер временно недоступен. Повторите позже; введённый текст остаётся в форме.",
    );
  if (!response.ok) throw new Error(result.error || "Не удалось выполнить действие.");
  return result;
}
