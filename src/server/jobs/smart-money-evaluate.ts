import "server-only";
import { db } from "@/db";
import { users } from "@/db/schema";
import { evaluateSmartMoneyForUser } from "@/server/smart-money-engine";

export async function evaluateAllSmartMoney() {
  const userRows = await db.select({ id: users.id }).from(users).limit(500);
  const results = [];
  for (const user of userRows) {
    results.push({ userId: user.id, ...(await evaluateSmartMoneyForUser(user.id)) });
  }
  return {
    usersEvaluated: userRows.length,
    eventsEvaluated: results.reduce((sum, result) => sum + result.evaluated, 0),
    alertsCreated: results.reduce((sum, result) => sum + result.alertsCreated, 0),
    results,
  };
}
