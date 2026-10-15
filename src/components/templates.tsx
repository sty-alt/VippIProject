"use client";
import { useEffect, useState } from "react";
import { api, type ServiceTemplate } from "./types";
import { ErrorBox } from "./ui";
import { money } from "@/lib/locale";
const empty = { name: "", price: 0, quantity: 1 };
export function Templates() {
  const [rows, setRows] = useState<ServiceTemplate[]>([]),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = () => api<ServiceTemplate[]>("templates").then(setRows);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Повторяющиеся работы</span>
          <h1>Мои работы и цены</h1>
          <p>Добавьте свои позиции один раз и выбирайте их при составлении сметы.</p>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel form-section">
          <h2>{editing ? "Изменить работу" : "Добавить работу"}</h2>
          <p className="hint">Изменение шаблона не меняет уже созданные сметы.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await api(editing ? `templates/${editing}/save` : "templates", form);
                await load();
                setForm(empty);
                setEditing("");
                setNotice("Работа сохранена.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Название работы
              <input
                required
                maxLength={160}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="two-col">
              <label>
                Цена, сум
                <input
                  required
                  type="number"
                  min={0}
                  max={100000000}
                  step={1}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                />
              </label>
              <label>
                Количество
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                />
              </label>
            </div>
            <ErrorBox message={error} />
            <div className="actions">
              <button className="primary" disabled={busy}>
                Сохранить работу
              </button>
              {editing && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditing("");
                    setForm(empty);
                  }}
                >
                  Отменить
                </button>
              )}
            </div>
          </form>
          {notice && (
            <p role="status" className="success-note">
              {notice}
            </p>
          )}
        </section>
        <section className="panel form-section">
          <h2>Сохранённые работы</h2>
          {loading ? (
            <p role="status">Загружаем работы…</p>
          ) : !rows.length ? (
            <p>Пока пусто. Добавьте первую работу со своей ценой.</p>
          ) : (
            rows.map((row) => (
              <div className="question-card" key={row.id}>
                <strong>{row.name}</strong>
                <p>
                  {row.quantity} × {money(row.price)}
                </p>
                <div className="actions">
                  <button
                    disabled={busy}
                    className="secondary"
                    onClick={() => {
                      setForm({ name: row.name, price: row.price, quantity: row.quantity });
                      setEditing(row.id);
                      setNotice("");
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm("Удалить шаблон? Существующие сметы сохранятся.")) return;
                      setBusy(true);
                      try {
                        await api(`templates/${row.id}/delete`, {});
                        await load();
                        if (editing === row.id) {
                          setEditing("");
                          setForm(empty);
                        }
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
