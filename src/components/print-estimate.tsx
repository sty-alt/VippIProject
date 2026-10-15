"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Conditions, Badge } from "./ui";
import type { EstimateInput } from "@/lib/validation";
import { date, type Status } from "@/lib/locale";
type PrintData = Pick<
  EstimateInput,
  "device" | "explanation" | "items" | "completion" | "warranty" | "validUntil"
> & {
  number: number;
  version: number;
  total: number;
  status: Status;
  decision: { outcome: string; createdAt: string } | null;
};
export function PrintEstimate({ workshop, data }: { workshop: string; data: PrintData }) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);
  return (
    <>
      <button type="button" className="secondary" onClick={() => setPrinting(true)}>
        Печать / PDF
      </button>
      {printing &&
        createPortal(
          <article className="print-document">
            <header>
              <strong>Согласовано</strong>
              <p>{workshop}</p>
              <h1>
                Смета № {String(data.number).padStart(4, "0")} · версия {data.version}
              </h1>
              <Badge status={data.status} />
            </header>
            <Conditions data={data} />
            <section>
              <h2>Решение клиента</h2>
              {data.decision ? (
                <p>
                  {data.decision.outcome === "approved" ? "Ремонт согласован" : "Отказ от ремонта"}{" "}
                  · {date(data.decision.createdAt)} (Ташкент)
                </p>
              ) : (
                <p>Решение для этой версии ещё не получено.</p>
              )}
              <small>
                Ответ держателя ссылки; личность не проверена. Документ относится только к указанной
                версии сметы.
              </small>
            </section>
          </article>,
          document.body,
        )}
    </>
  );
}
