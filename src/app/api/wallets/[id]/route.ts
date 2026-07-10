import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { deleteWallet, updateWallet } from "@/server/wallets";
import { walletPatchSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  return json(await updateWallet(user.id, id, await parseJson(request, walletPatchSchema)));
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deleteWallet(user.id, id);
  return new Response(null, { status: 204 });
});
