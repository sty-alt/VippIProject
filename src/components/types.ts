import type { EstimateInput } from "@/lib/validation";
import type { Status } from "@/lib/locale";
export type Question = { id: string; text: string; answer: string | null; createdAt: string; answeredAt: string | null };
export type Version = Omit<EstimateInput, "items"> & { id: string; number: number; total: number; publishedAt: string | null; replacedAt: string | null; createdAt: string; status: Status; items: (EstimateInput["items"][number] & { id: string })[]; questions: Question[]; decision: { outcome: string; createdAt: string } | null; events: { id: string; type: string; createdAt: string }[] };
export type Estimate = { id: string; number: number; currentVersionId: string | null; versions: Version[] };
export type Row = { id: string; number: number; device: string; clientName: string; total: number; createdAt: string; status: Status; hasDraft: boolean; hasQuestion: boolean };
export type PublicEstimate = { workshop: string; number: number; version: number; device: string; explanation: string; completion: string; warranty: string; validUntil: string; total: number; items: EstimateInput["items"]; questions: Omit<Question, "id">[]; decision: { outcome: string; createdAt: string } | null; status: Status; available: boolean; revoked: boolean };
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/service/${path}`, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Не удалось выполнить действие.");
  return result;
}
