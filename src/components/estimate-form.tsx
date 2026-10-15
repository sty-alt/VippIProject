"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateTotal, type EstimateInput } from "@/lib/validation";
import { money } from "@/lib/locale";
import { api, type Estimate, type Version, type ServiceTemplate } from "./types";
import { Conditions, ErrorBox } from "./ui";
import { readRecovery, recoveryPrefix } from "@/lib/draft-recovery";
type AIResult = { problem: string; works: string; missing: string[] };
function initial(v?: Version): EstimateInput {
  return v
    ? {
        clientName: v.clientName,
        device: v.device,
        note: v.note,
        explanation: v.explanation,
        completion: v.completion,
        warranty: v.warranty,
        validUntil: v.validUntil,
        items: v.items.map(({ name, quantity, price }) => ({ name, quantity, price })),
      }
    : {
        clientName: "",
        device: "",
        note: "",
        explanation: "",
        completion: "",
        warranty: "",
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ name: "", quantity: 1, price: 0 }],
      };
}
export function EstimateForm({
  estimateId,
  version,
  aiEnabled,
  onSaved,
  workshopId,
}: {
  estimateId?: string;
  version?: Version;
  aiEnabled: boolean;
  onSaved?: () => void;
  workshopId: string;
}) {
  const [form, setForm] = useState<EstimateInput>(() => initial(version)),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [ai, setAi] = useState<AIResult | null>(null),
    [aiSource, setAiSource] = useState(""),
    [templates, setTemplates] = useState<ServiceTemplate[]>([]),
    [templateId, setTemplateId] = useState(""),
    [recovery, setRecovery] = useState<ReturnType<typeof readRecovery>>(null),
    [storageError, setStorageError] = useState(false);
  const storageKey = `${recoveryPrefix}${workshopId}:${estimateId ?? "new"}:${version?.id ?? "new"}`;
  const [base] = useState(() => (version ? JSON.stringify(initial(version)) : "new"));
  const source = JSON.stringify({ note: form.note, works: form.items.map((i) => i.name) });
  const staleAI = !!ai && aiSource !== source;
  const dirtyRef = useRef(false);
  const router = useRouter();
  const previewRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let alive = true;
    api<ServiceTemplate[]>("templates")
      .then((result) => {
        if (alive) setTemplates(result);
      })
      .catch(() => {});
    Promise.resolve().then(() => {
      if (!alive) return;
      try {
        setRecovery(readRecovery(sessionStorage, storageKey));
      } catch {
        setStorageError(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [storageKey]);
  useEffect(() => {
    const persist = () => {
      if (!dirtyRef.current) return;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ form, base, savedAt: Date.now() }));
      } catch {
        setStorageError(true);
      }
    };
    const timer = dirty ? setTimeout(persist, 400) : undefined;
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
    };
  }, [form, dirty, storageKey, base]);
  function clearRecovery() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    setRecovery(null);
  }
  useEffect(() => {
    if (preview) previewRef.current?.showModal();
  }, [preview]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", leave);
    const click = (e: MouseEvent) => {
      if (
        dirty &&
        (e.target as HTMLElement).closest("a[href]") &&
        !confirm("Есть несохранённые изменения. Покинуть страницу?")
      )
        e.preventDefault();
    };
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  function update<K extends keyof EstimateInput>(key: K, value: EstimateInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    dirtyRef.current = true;
  }
  let total = 0,
    totalError = "";
  try {
    total = calculateTotal(form.items.map((i) => ({ ...i, name: i.name || "Позиция" })));
  } catch {
    totalError = "Проверьте цены и количество. Максимальная сумма — 1 млрд сум.";
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (estimateId && version) {
        await api(`estimates/${estimateId}/save`, { versionId: version.id, input: form });
        clearRecovery();
        dirtyRef.current = false;
        setDirty(false);
        onSaved?.();
      } else {
        const result = await api<Estimate>("estimates", form);
        clearRecovery();
        dirtyRef.current = false;
        setDirty(false);
        router.push(`/estimates/${result.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    setError("");
    setAi(null);
    setAiSource("");
    try {
      const captured = source;
      const result = await api<AIResult>("ai", {
        note: form.note,
        works: form.items.map((i) => i.name),
      });
      setAi(result);
      setAiSource(captured);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: "clientName" | "device" | "completion" | "warranty",
    label: string,
    placeholder: string,
    max: number,
  ) => (
    <label>
      {label}
      <input
        required
        value={form[key]}
        placeholder={placeholder}
        maxLength={max}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <Link
            prefetch={false}
            className="back-link"
            href={estimateId ? `/estimates/${estimateId}` : "/"}
          >
            ← К сметам
          </Link>
          <h1>{version ? `Черновик · версия ${version.number}` : "Новая смета"}</h1>
          <p>Опишите ремонт. Проверьте условия перед публикацией.</p>
        </div>
        <span className="badge draft">{dirty ? "Есть несохранённые изменения" : "Черновик"}</span>
      </div>
      <form onSubmit={save} className="editor-grid">
        <div className="editor-main">
          {recovery && (
            <section className="panel form-section" aria-label="Восстановление ввода">
              <h2>Остался несохранённый ввод</h2>
              <p>
                Копия от {new Date(recovery.savedAt).toLocaleTimeString("ru-RU")}, только в этой
                вкладке.
              </p>
              {recovery.base !== base && (
                <p className="hint">
                  Сохранённая версия изменилась. Восстановление заменит поля формы локальной копией;
                  проверьте её перед сохранением.
                </p>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setForm(recovery.form);
                    setDirty(true);
                    dirtyRef.current = true;
                    setRecovery(null);
                  }}
                >
                  Восстановить ввод
                </button>
                <button type="button" className="secondary" onClick={clearRecovery}>
                  Удалить локальную копию
                </button>
              </div>
            </section>
          )}
          <p className="hint" role="status">
            {storageError
              ? "Браузер не разрешил сохранить локальную копию. Сохраните черновик перед уходом."
              : "Несохранённый ввод хранится в этой вкладке до суток и удаляется при выходе из аккаунта. Это ещё не сохранённая смета."}
          </p>
          <section className="panel form-section">
            <h2>Клиент и устройство</h2>
            <div className="two-col">
              {field("clientName", "Имя клиента", "Например, Азиз", 100)}
              {field("device", "Устройство", "Например, ASUS X515", 160)}
            </div>
          </section>
          <section className="panel form-section">
            <div className="section-title">
              <h2>Понятное объяснение</h2>
              <span className="subtle-label">AI помогает с текстом</span>
            </div>
            <label>
              Заметка мастера <span className="optional">· только для вас</span>
              <textarea
                rows={3}
                value={form.note}
                maxLength={4000}
                onChange={(e) => update("note", e.target.value)}
                placeholder="Что обнаружено и какие работы нужны"
              />
              <small>
                Не вводите персональные или конфиденциальные данные. Очевидные телефоны и email
                удаляются перед AI-запросом; полная анонимизация не гарантируется.
              </small>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={
                busy || !aiEnabled || !form.note.trim() || form.items.some((i) => !i.name.trim())
              }
              onClick={generate}
            >
              {busy ? "Подождите…" : "✦ Сформировать AI-черновик"}
            </button>
            {!aiEnabled && (
              <p className="hint">
                AI пока не настроен. Напишите объяснение вручную — все остальные действия доступны.
              </p>
            )}
            {ai && (
              <div className="ai-draft">
                <strong>AI-черновик · проверьте факты</strong>
                {staleAI && (
                  <p role="alert" className="hint">
                    Исходные данные изменились. Сформируйте новый AI-черновик перед переносом.
                  </p>
                )}
                <p>{ai.problem}</p>
                <p>{ai.works}</p>
                {ai.missing.length > 0 && (
                  <>
                    <small>Нужно уточнить:</small>
                    <ul>
                      {ai.missing.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={staleAI || busy}
                  onClick={() => {
                    if (
                      !form.explanation ||
                      confirm("Заменить текущее объяснение проверенным AI-текстом?")
                    )
                      update("explanation", `${ai.problem}\n\n${ai.works}`);
                  }}
                >
                  Перенести проверенный текст
                </button>
              </div>
            )}
            <label>
              Объяснение для клиента
              <textarea
                required
                rows={4}
                maxLength={4000}
                value={form.explanation}
                onChange={(e) => update("explanation", e.target.value)}
                placeholder="Объясните, почему нужен ремонт и что дадут предложенные работы"
              />
            </label>
          </section>
          <section className="panel form-section">
            <div className="section-title">
              <h2>Работы и детали</h2>
              <span className="subtle-label">Цены в сумах</span>
            </div>
            <div className="template-picker">
              <label>
                Из моих работ
                <select
                  aria-label="Из моих работ"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">Выберите сохранённую работу</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {money(t.price)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                disabled={!templateId || form.items.length >= 30}
                onClick={() => {
                  const selected = templates.find((t) => t.id === templateId);
                  if (!selected) return;
                  const item = {
                    name: selected.name,
                    quantity: selected.quantity,
                    price: selected.price,
                  };
                  update(
                    "items",
                    form.items.length === 1 && !form.items[0].name && !form.items[0].price
                      ? [item]
                      : [...form.items, item],
                  );
                  setTemplateId("");
                }}
              >
                Добавить из моих работ
              </button>
              <Link prefetch={false} href="/templates">
                Настроить работы и цены
              </Link>
            </div>
            {form.items.map((item, index) => (
              <div className="item-editor" key={index}>
                <label className="item-name">
                  Название
                  <input
                    required
                    maxLength={160}
                    value={item.name}
                    onChange={(e) =>
                      update(
                        "items",
                        form.items.map((v, i) =>
                          i === index ? { ...v, name: e.target.value } : v,
                        ),
                      )
                    }
                    placeholder="Чистка системы охлаждения"
                  />
                </label>
                <label>
                  Кол-во
                  <input
                    required
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={item.quantity}
                    onChange={(e) =>
                      update(
                        "items",
                        form.items.map((v, i) =>
                          i === index ? { ...v, quantity: Number(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Цена, сум
                  <input
                    required
                    type="number"
                    min={0}
                    max={100000000}
                    step={1}
                    value={item.price}
                    onChange={(e) =>
                      update(
                        "items",
                        form.items.map((v, i) =>
                          i === index ? { ...v, price: Number(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Удалить позицию ${index + 1}`}
                  disabled={form.items.length === 1}
                  onClick={() =>
                    update(
                      "items",
                      form.items.filter((_, i) => i !== index),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={form.items.length >= 30}
              onClick={() => update("items", [...form.items, { name: "", quantity: 1, price: 0 }])}
            >
              ＋ Добавить позицию
            </button>
            <ErrorBox message={totalError} />
          </section>
          <section className="panel form-section">
            <h2>Условия ремонта</h2>
            <div className="two-col">
              {field("completion", "Срок выполнения", "Например, завтра до 18:00", 300)}
              {field("warranty", "Условия гарантии", "На кулер — 3 месяца", 500)}
            </div>
            <label>
              Срок действия предложения (время Ташкента)
              <input
                required
                type="datetime-local"
                value={new Date(new Date(form.validUntil).getTime() + 5 * 3600000)
                  .toISOString()
                  .slice(0, 16)}
                onChange={(e) => {
                  if (e.target.value)
                    update("validUntil", new Date(`${e.target.value}:00+05:00`).toISOString());
                }}
              />
            </label>
          </section>
        </div>
        <aside className="editor-summary panel">
          <span className="eyebrow">Итог сметы</span>
          <strong className="big-total">{money(total)}</strong>
          <p>{form.items.length} позиций · условия сохраняются в версии</p>
          <hr />
          <p>Черновик виден только вам. После публикации клиент получит отдельную ссылку.</p>
          <ErrorBox message={error} />
          <button className="primary wide" disabled={busy || !!totalError}>
            {busy ? "Сохраняем…" : "Сохранить черновик"}
          </button>
          <button
            className="secondary wide"
            type="button"
            disabled={busy || !!totalError}
            onClick={() => setPreview(true)}
          >
            Предпросмотр для клиента
          </button>
          <small>Предпросмотр не публикует смету.</small>
        </aside>
      </form>
      {preview && (
        <dialog ref={previewRef} onCancel={() => setPreview(false)} className="modal">
          <div className="modal-body">
            <div className="section-title">
              <h2>Предпросмотр</h2>
              <button autoFocus onClick={() => setPreview(false)} aria-label="Закрыть предпросмотр">
                ×
              </button>
            </div>
            <p className="hint">Черновик. Клиентская ссылка ещё не выпущена.</p>
            <Conditions data={{ ...form, total }} />
          </div>
        </dialog>
      )}
    </>
  );
}
