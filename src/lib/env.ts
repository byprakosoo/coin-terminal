import "server-only";

const localDatabaseUrl = "mysql://root@127.0.0.1:3306/coin_terminal";
const localAuthSecret = "coin-terminal-local-development-secret-change-me";

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? localDatabaseUrl,
  databaseSsl: process.env.DATABASE_SSL === "true",
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? localAuthSecret,
  betterAuthUrl:
    process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  cronSecret: process.env.CRON_SECRET,
  etherscanApiKey: process.env.ETHERSCAN_API_KEY,
} as const;

export function assertProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const missing = [
    !process.env.DATABASE_URL && "DATABASE_URL",
    !process.env.BETTER_AUTH_SECRET && "BETTER_AUTH_SECRET",
    !process.env.BETTER_AUTH_URL && "BETTER_AUTH_URL",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}
