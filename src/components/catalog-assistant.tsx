"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type ServiceTemplate, type CatalogDraft } from "./types";
import { ErrorBox } from "./ui";
import { money } from "@/lib/locale";
import { mergeReviewedCatalog } from "@/lib/reviewed-catalog";
import type { EstimateInput } from "@/lib/validation";
export function CatalogAssistant({
  note,
  items,
  explanation,
  available,
  aiEnabled,
  busy,
  onBusyChange,
  onApply,
}: {
  note: string;
  items: EstimateInput["items"];
  explanation: string;
  available: boolean;
  aiEnabled: boolean;
  busy: boolean;
  onBusyChange: (value: boolean) => void;
  onApply: (items: EstimateInput["items"], explanation: string) => void;
}) {
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [draftSource, setDraftSource] = useState("");
  const [reviewedSource, setReviewedSource] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const works = items.map((item) => item.name.trim()).filter(Boolean);
  const source = JSON.stringify({ note, works });
  const stale = draftSource !== source;
  async function generate() {
    onBusyChange(true);
    setError("");
    setNotice("");
    setDraft(null);
    setReviewedSource("");
    try {
      const captured = source;
      const result = await api<CatalogDraft>("ai/catalog", { note, works });
      setDraft(result);
      setDraftSource(captured);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusyChange(false);
    }
  }
  // Used only in event handlers to detect edits made while checking current catalog prices.
  const formRevision = useRef(0);
  useEffect(() => {
    formRevision.current += 1;
  }, [note, items, explanation]);
  async function apply() {
    if (!draft || stale || reviewedSource !== source) return;
    if (
      explanation &&
      !confirm(
        "Добавить выбранные AI работы и заменить текущее объяснение? Уже введённые позиции и цены сохранятся.",
      )
    )
      return;
    onBusyChange(true);
    setError("");
    try {
      const revision = formRevision.current;
      const latest = await api<ServiceTemplate[]>("templates");
      if (formRevision.current !== revision)
        throw Error("Форма изменилась во время проверки. Повторите перенос после проверки данных.");
      const merged = mergeReviewedCatalog(items, draft.items, latest);
      onApply(merged, `${draft.problem}\n\n${draft.works}`);
      setDraft(null);
      setReviewedSource("");
      setNotice("Работы и объяснение перенесены в форму. Смета ещё не сохранена.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <section className="catalog-assistant" aria-label="AI-помощник сметы">
      <strong>Из заметки — в черновик сметы</strong>
      <p>
        AI сопоставит указанные мастером работы с вашим каталогом, подготовит объяснение и покажет,
        что нужно уточнить. Цены и количество берутся из каталога.
      </p>
      {!available && (
        <p className="hint">
          Сначала{" "}
          <Link prefetch={false} href="/templates">
            добавьте свои работы и цены
          </Link>
          . Объяснение по вручную введённым позициям можно сформировать ниже.
        </p>
      )}
      <button
        className="secondary"
        type="button"
        disabled={busy || !aiEnabled || !available || !note.trim()}
        onClick={generate}
      >
        Подобрать работы из каталога с AI
      </button>
      <ErrorBox message={error} />
      {notice && (
        <p role="status" className="success-note">
          {notice}
        </p>
      )}
      {draft && (
        <div className="ai-draft">
          <strong>Предложение AI · ещё не добавлено в смету</strong>
          {stale && (
            <p role="alert" className="hint">
              Заметка или перечень работ изменились. Сформируйте предложение заново.
            </p>
          )}
          <p>{draft.problem}</p>
          <p>{draft.works}</p>
          {draft.items.map((item) => (
            <div className="question-card" key={item.catalogId}>
              <strong>{item.name}</strong>
              <p>
                {item.quantity} × {money(item.price)}
              </p>
              <small>Основание в заметке:</small>
              <blockquote>{item.evidence}</blockquote>
            </div>
          ))}
          {!draft.items.length && (
            <p className="hint">
              Подходящие работы не определены. Уточните решение мастера; AI не должен назначать
              ремонт по одному симптому.
            </p>
          )}
          {!!draft.missing.length && (
            <>
              <strong>Нужно уточнить</strong>
              <ul>
                {draft.missing.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </>
          )}
          {!!draft.items.length && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  disabled={stale || busy}
                  checked={!stale && reviewedSource === source}
                  onChange={(e) => setReviewedSource(e.target.checked ? source : "")}
                />
                Проверил работы, цены, основания и объяснение
              </label>
              <button
                className="secondary"
                type="button"
                disabled={busy || stale || reviewedSource !== source}
                onClick={apply}
              >
                Перенести проверенные работы и объяснение
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
