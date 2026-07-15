import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import {
  accounts,
  authRateLimits,
  sessions,
  users,
  verifications,
} from "@/db/schema";
import { assertProductionEnv, env } from "@/lib/env";

assertProductionEnv();

export const auth = betterAuth({
  appName: "Coin Terminal",
  baseURL: env.betterAuthUrl,
  trustedOrigins: [env.betterAuthUrl],
  secret: env.betterAuthSecret,
  database: drizzleAdapter(db, {
    provider: "mysql",
    camelCase: true,
    transaction: true,
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      rateLimit: authRateLimits,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      displayCurrency: {
        type: "string",
        required: true,
        defaultValue: "IDR",
        input: false,
      },
      timezone: {
        type: "string",
        required: true,
        defaultValue: "UTC",
        input: false,
      },
      disclaimerAccepted: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
      onboardingComplete: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60 * 10, max: 5 },
    },
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
    cookiePrefix: "coin-terminal",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
