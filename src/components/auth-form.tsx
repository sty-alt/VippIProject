"use client";
import { useState } from "react";
import { Logo, ErrorBox } from "./ui";
export function AuthForm() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch(`/api/auth/${register ? "sign-up" : "sign-in"}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          ...(register ? { name: form.get("name") } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Проверьте данные и повторите попытку.");
      }
      // Reload the document after authentication to read the new server session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось подключиться.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <Logo />
        <div>
          <span className="eyebrow">Для мастерских Ташкента</span>
          <h1>
            Понятная смета.
            <br />
            Спокойный клиент.
          </h1>
          <p>
            Объясните ремонт простыми словами, отправьте ссылку и получите решение клиента в одном
            месте.
          </p>
          <div className="auth-steps">
            <span>Составьте смету</span>
            <span>Отправьте ссылку</span>
            <span>Получите ответ</span>
          </div>
        </div>
        <small>Ноутбуки и телефоны · суммы в сумах</small>
      </section>
      <section className="auth-panel">
        <form onSubmit={submit}>
          <span className="eyebrow">Ваш рабочий кабинет</span>
          <h2>{register ? "Создать мастерскую" : "С возвращением"}</h2>
          <p className="muted">
            {register
              ? "Один аккаунт владельца. Только ваши сметы."
              : "Войдите, чтобы продолжить согласование ремонта."}
          </p>
          {register && (
            <label>
              Название мастерской
              <input
                name="name"
                required
                maxLength={100}
                autoComplete="organization"
                placeholder="Например, ТехноМастер"
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="master@example.com"
            />
          </label>
          <label>
            Пароль
            <input
              aria-label="Пароль"
              aria-describedby="password-help"
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
            <small id="password-help">Не менее 10 символов</small>
          </label>
          <ErrorBox message={error} />
          <button className="primary wide" disabled={busy}>
            {busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти"}
          </button>
          <button
            type="button"
            className="text-button wide"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Уже есть аккаунт? Войти" : "Первый раз здесь? Создать аккаунт"}
          </button>
        </form>
      </section>
    </main>
  );
}
