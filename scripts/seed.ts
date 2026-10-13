import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { createEstimate, publish, publicAction } from "../src/lib/estimates";
async function main() {
  const email = process.env.DEMO_EMAIL || "demo@soglasovano.example";
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const password = process.env.DEMO_PASSWORD || randomBytes(18).toString("base64url");
    const registered = await auth.api.signUpEmail({ body: { name: "ТехноМастер · демо", email, password } });
    user = await db.user.findUniqueOrThrow({ where: { id: registered.user.id } });
    await mkdir(".local", { recursive: true });
    await writeFile(".local/demo-credentials.json", JSON.stringify({ email, password }, null, 2));
  }
  const shop = await db.workshop.upsert({ where: { ownerId: user.id }, update: {}, create: { ownerId: user.id, name: user.name } });
  if (await db.estimate.count({ where: { workshopId: shop.id } })) { console.log("Demo already exists; no records overwritten."); return; }
  const base = { clientName: "Азиз · вымышленный клиент", device: "ASUS X515", note: "Кулер шумит, термопаста высохла. Данные вымышлены.", explanation: "Система охлаждения загрязнена, а кулер шумит. Предлагаем очистить её и заменить кулер, чтобы устранить указанные проблемы.", completion: "Завтра до 18:00", warranty: "На новый кулер — 3 месяца. На чистку — 14 дней.", validUntil: new Date(Date.now() + 7 * 86400000).toISOString(), items: [{ name: "Чистка системы охлаждения", quantity: 1, price: 180000 }, { name: "Замена кулера", quantity: 1, price: 220000 }] };
  for (const [index, device] of ["ASUS X515", "iPhone 13", "Samsung Galaxy A54", "Lenovo ThinkPad T14"].entries()) {
    const e = await createEstimate(shop.id, { ...base, device, clientName: ["Азиз", "Мадина", "Дилшод", "Сабина"][index] + " · демо" });
    if (index < 3) { const p = await publish(shop.id, e.id, e.versions[0].id); if (index === 1) await publicAction(p.token, { action: "approved", accepted: true }); if (index === 2) await publicAction(p.token, { action: "question", text: "Деталь будет новой? (демонстрационный вопрос)" }); }
  }
  console.log("Four fictional estimates created. Credentials: .local/demo-credentials.json (ignored by Git).");
}
main().catch(() => { console.error("Demo seed failed; check database and configuration."); process.exitCode = 1; }).finally(() => db.$disconnect());
