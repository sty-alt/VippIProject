import { auth } from "@/lib/auth";
import { checkOrigin, readBody, throttle, AppError } from "@/lib/security";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => auth.handler(request);
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readBody(request.clone());
    const path = new URL(request.url).pathname;
    if (path.includes("sign-in") || path.includes("sign-up")) {
      await throttle("auth-global", "all", 100);
      await throttle("auth-email", typeof body.email === "string" ? body.email.toLowerCase() : "unknown", 10);
    }
    const response = await auth.handler(request);
    if (!response.ok && (path.includes("sign-in") || path.includes("sign-up"))) return Response.json({ message: "Не удалось войти или зарегистрироваться. Проверьте данные или используйте другой email." }, { status: response.status });
    return response;
  } catch (e) { return Response.json({ message: e instanceof AppError ? e.message : "Не удалось выполнить запрос." }, { status: e instanceof AppError ? e.status : 400 }); }
}
