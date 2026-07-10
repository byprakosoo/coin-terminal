import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

const globalForDatabase = globalThis as unknown as {
  coinTerminalPool?: mysql.Pool;
};

export const pool =
  globalForDatabase.coinTerminalPool ??
  mysql.createPool({
    uri: env.databaseUrl,
    connectionLimit: 10,
    decimalNumbers: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
    ssl: env.databaseSsl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.coinTerminalPool = pool;
}

export const db = drizzle({ client: pool, schema, mode: "default" });

export { schema };
