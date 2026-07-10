import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiConversations, aiMessages, aiToolCalls } from "@/db/schema";
import { buildAssistantReply } from "@/lib/assistant";
import { ApiError } from "@/server/api";
import { createId } from "@/server/ids";
import { mapConversation, mapMessage } from "@/server/mappers";
import { loadWorkspace } from "@/server/workspace";

export async function createConversation(userId: string, title = "New conversation") {
  const id = createId();
  await db.insert(aiConversations).values({ id, userId, title });
  const [row] = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
    .limit(1);
  return mapConversation(row!);
}

export async function deleteConversation(userId: string, conversationId: string) {
  const result = await db
    .update(aiConversations)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.userId, userId),
        isNull(aiConversations.deletedAt),
      ),
    );
  if (!affectedRows(result)) throw new ApiError(404, "Conversation not found.", "NOT_FOUND");
}

export async function listConversationMessages(userId: string, conversationId: string) {
  await requireConversation(userId, conversationId);
  const rows = await db
    .select({ message: aiMessages, call: aiToolCalls })
    .from(aiMessages)
    .leftJoin(aiToolCalls, eq(aiToolCalls.aiMessageId, aiMessages.id))
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(aiMessages.createdAt);
  return rows.map(({ message, call }) => ({
    ...mapMessage(message),
    toolName: call?.toolName,
  }));
}

export async function sendConversationMessage(
  userId: string,
  conversationId: string,
  content: string,
) {
  await requireConversation(userId, conversationId);
  const workspace = await loadWorkspace(userId);
  const reply = buildAssistantReply(content, workspace);
  const userMessageId = createId();
  const assistantMessageId = createId();
  const now = new Date();
  const answer = reply.investmentRelated
    ? `${reply.content}\n\nResearch only — not investment advice.`
    : reply.content;
  const title = content.length > 80 ? `${content.slice(0, 79)}…` : content;

  await db.transaction(async (tx) => {
    await tx.insert(aiMessages).values({
      id: userMessageId,
      conversationId,
      role: "USER",
      content,
      investmentRelated: false,
      createdAt: now,
    });
    await tx.insert(aiMessages).values({
      id: assistantMessageId,
      conversationId,
      role: "ASSISTANT",
      content: answer,
      sourceSummary: reply.sources.map((source) => ({ ...source })),
      investmentRelated: reply.investmentRelated,
      createdAt: new Date(now.getTime() + 1),
    });
    await tx.insert(aiToolCalls).values({
      id: createId(),
      aiMessageId: assistantMessageId,
      toolName: reply.toolName,
      status: "SUCCEEDED",
      requestSummary: { questionLength: content.length, identitySource: "authenticated-session" },
      resultSummary: {
        receiptCount: reply.sources.length,
        freshness: reply.sources.map((source) => source.freshness),
      },
    });
    await tx
      .update(aiConversations)
      .set({ title, updatedAt: now })
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
  });

  return {
    conversationId,
    userMessage: {
      id: userMessageId,
      conversationId,
      role: "USER" as const,
      content,
      createdAt: now.toISOString(),
    },
    assistantMessage: {
      id: assistantMessageId,
      conversationId,
      role: "ASSISTANT" as const,
      content: answer,
      createdAt: new Date(now.getTime() + 1).toISOString(),
      toolName: reply.toolName,
      sources: reply.sources,
      investmentRelated: reply.investmentRelated,
    },
  };
}

async function requireConversation(userId: string, conversationId: string) {
  const [conversation] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.userId, userId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!conversation) throw new ApiError(404, "Conversation not found.", "NOT_FOUND");
}

function affectedRows(result: unknown) {
  if (Array.isArray(result)) return Number((result[0] as { affectedRows?: number })?.affectedRows ?? 0);
  return Number((result as { affectedRows?: number })?.affectedRows ?? 0);
}
