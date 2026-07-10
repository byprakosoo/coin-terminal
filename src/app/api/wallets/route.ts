import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createWallet } from "@/server/wallets";
import { walletSchema } from "@/server/validators";
import { loadWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json((await loadWorkspace(user.id)).wallets);
});

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, walletSchema);
  return json(await createWallet(user.id, input), { status: 201 });
});
