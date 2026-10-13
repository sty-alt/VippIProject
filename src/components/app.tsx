"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthForm } from "./auth-form";
import { Dashboard } from "./dashboard";
import { EstimateDetail } from "./estimate-detail";
import { EstimateForm } from "./estimate-form";
import { PublicPage } from "./public-page";
import { Logo, ErrorBox } from "./ui";
import { api } from "./types";
export function App() {
  const path = usePathname();
  const isPublic = path.startsWith("/c/");
  const [workshop, setWorkshop] = useState<{ name: string } | null>(null), [aiEnabled, setAiEnabled] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    if (isPublic) return;
    let alive = true;
    api<{ workshop: { name: string }; aiEnabled: boolean }>("workshop").then(result => { if (alive) { setWorkshop(result.workshop); setAiEnabled(result.aiEnabled); } }).catch(e => { if (alive && e.message !== "Войдите в аккаунт.") setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isPublic]);
  if (isPublic) return <PublicPage token={path.split("/")[2]} />;
  if (loading) return <main className="public-wrap"><Logo /><p role="status">Открываем кабинет…</p></main>;
  if (error) return <main className="public-wrap"><Logo /><ErrorBox message={error} /><button onClick={() => location.reload()}>Повторить</button></main>;
  if (!workshop) return <AuthForm />;
  async function logout() { const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (response.ok) location.href = "/"; else setError("Не удалось выйти. Повторите попытку."); }
  return <div className="app-shell"><aside className="sidebar"><Logo /><div className="workshop-label"><span className="avatar">{workshop.name.slice(0, 1).toUpperCase()}</span><div><strong>{workshop.name}</strong><small>Мастерская · Ташкент</small></div></div><nav><Link prefetch={false} className="nav-active" href="/"><span aria-hidden="true">▤</span> Сметы <span className="nav-arrow">→</span></Link><Link prefetch={false} href="/new"><span aria-hidden="true">＋</span> Новая смета</Link></nav><div className="sidebar-bottom"><p>Сначала согласование.<br />Потом ремонт.</p><button className="text-button" onClick={logout}>Выйти из аккаунта</button></div></aside><div className="main-area"><header className="topbar"><span>Рабочий кабинет</span><span className="owner-chip">Владелец мастерской</span></header><main className="workspace">{path === "/new" ? <EstimateForm aiEnabled={aiEnabled} /> : /^\/estimates\/[^/]+$/.test(path) ? <EstimateDetail id={path.split("/")[2]} aiEnabled={aiEnabled} /> : path === "/" ? <Dashboard /> : <div className="panel"><h1>Страница не найдена</h1><Link prefetch={false} href="/">Вернуться к сметам</Link></div>}</main><footer>Согласовано · Суммы в UZS · Время Ташкента (UTC+5)</footer></div></div>;
}
