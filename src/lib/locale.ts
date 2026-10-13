export const ru = {
  statuses: {
    draft: "Черновик",
    waiting: "Ожидает ответа",
    approved: "Согласовано",
    declined: "Отказ",
    clarification: "Требуется уточнение",
    expired: "Истекла",
    replaced: "Заменена новой версией",
    revoked: "Ссылка отозвана",
  },
  events: {
    published: "Смета опубликована",
    question: "Клиент задал вопрос",
    answered: "Мастер ответил на вопрос",
    approved: "Клиент согласовал ремонт",
    declined: "Клиент отказался",
    replaced: "Версия заменена",
    revoked: "Ссылка отозвана",
    reissued: "Ссылка перевыпущена",
  },
  brand: "Согласовано",
  tagline: "Ремонт начинается с ясности",
};
export type Status = keyof typeof ru.statuses;
export const money = (value: number) => new Intl.NumberFormat("ru-RU").format(value) + " сум";
export const date = (value: string | Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
