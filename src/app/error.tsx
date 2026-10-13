"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="public-wrap">
      <h1>Не удалось открыть страницу</h1>
      <p>Проверьте соединение и повторите попытку.</p>
      <button onClick={reset}>Повторить</button>
    </main>
  );
}
