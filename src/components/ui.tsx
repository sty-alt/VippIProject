import Link from "next/link";
import { ru, money, date, type Status } from "@/lib/locale";
import type { EstimateInput } from "@/lib/validation";
export function Badge({ status }: { status: Status }) { return <span className={`badge ${status}`}>{ru.statuses[status]}</span>; }
export function ErrorBox({ message }: { message: string }) { return message ? <div className="error" role="alert">{message}</div> : null; }
export function Logo() { return <Link prefetch={false} className="brand" href="/"><span className="brand-mark" aria-hidden="true">✓</span><span>Согласовано<span className="brand-sub">для вашей мастерской</span></span></Link>; }
export function Conditions({ data }: { data: Pick<EstimateInput, "device" | "explanation" | "items" | "completion" | "warranty" | "validUntil"> & { total: number } }) {
  return <><div className="device-heading"><span className="eyebrow">Устройство</span><h2>{data.device}</h2></div><p className="explanation">{data.explanation}</p><div className="line-items">{data.items.map((item, i) => <div className="line-item" key={i}><div><strong>{item.name}</strong><small>{item.quantity} × {money(item.price)}</small></div><strong>{money(item.quantity * item.price)}</strong></div>)}</div><div className="total"><span>Итого к согласованию</span><strong>{money(data.total)}</strong></div><dl className="conditions"><div><dt>Срок выполнения</dt><dd>{data.completion}</dd></div><div><dt>Гарантия</dt><dd>{data.warranty}</dd></div><div><dt>Предложение действует до</dt><dd>{date(data.validUntil)} <small>Ташкент</small></dd></div></dl></>;
}
