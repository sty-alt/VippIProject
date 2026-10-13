import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db } from "./db";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
  trustedOrigins: [process.env.BETTER_AUTH_URL!],
  session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
  advanced: { defaultCookieAttributes: { sameSite: "lax", httpOnly: true, secure: process.env.BETTER_AUTH_URL?.startsWith("https:") } },
  rateLimit: { enabled: true, window: 60, max: 15 },
  logger: { disabled: true }
});
