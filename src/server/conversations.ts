import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiConversations, aiMessages, aiToolCalls } from "@/db/schema";
import { buildAssistantReply } from "@/lib/assistant";
import { getActiveAiModelConfig } from "@/server/ai-models";
import { generateAssistantAnswer } from "@/server/ai-portfolio-assistant";
import { ApiError } from "@/server/api";
import { getBtcStrategyProfile } from "@/server/btc-strategy";
import { createId } from "@/server/ids";
import { mapConversation, mapMessage } from "@/server/mappers";
import { getPortfolioRecap } from "@/server/portfolio-recap";
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
  return rows.map(({ message, call }) => {
    const generation = generationMetadata(call?.resultSummary);
    return {
      ...mapMessage(message),
      toolName: call?.toolName,
      ...generation,
    };
  });
}

export async function sendConversationMessage(
  userId: string,
  conversationId: string,
  content: string,
) {
  await requireConversation(userId, conversationId);
  const [workspace, portfolioRecap, strategyProfile] = await Promise.all([
    loadWorkspace(userId),
    getPortfolioRecap(userId),
    getBtcStrategyProfile(userId),
  ]);
  const historyRows = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(desc(aiMessages.createdAt))
    .limit(8);
  const assistantContext = {
    ...workspace,
    displayCurrency: workspace.profile.displayCurrency,
    portfolioRecap,
    strategyProfile,
  };
  const customConfig = await getActiveAiModelConfig(userId);
  const groundedReply = buildAssistantReply(content, assistantContext);
  const generation = await generateAssistantAnswer({
    question: content,
    context: assistantContext,
    groundedReply,
    history: historyRows.reverse(),
    customConfig,
  });
  const reply = generation.reply;
  const userMessageId = createId();
  const assistantMessageId = createId();
  const now = new Date();
  const investmentRelated = isInvestmentRelated(
    `${content}\n${reply.content}`,
    reply.investmentRelated,
  );
  const answer = investmentRelated
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
      investmentRelated,
      createdAt: new Date(now.getTime() + 1),
    });
    await tx.insert(aiToolCalls).values({
      id: createId(),
      aiMessageId: assistantMessageId,
      toolName: reply.toolName,
      status: "SUCCEEDED",
      requestSummary: {
        questionLength: content.length,
        identitySource: "authenticated-session",
        scope: "user-id-filtered",
        retrieval: "structured-rag-full-ledger-aggregates-plus-relevant-evidence",
        modelContext: "allowlisted-financial-fields-without-record-ids-or-notes",
      },
      resultSummary: {
        receiptCount: reply.sources.length,
        freshness: reply.sources.map((source) => source.freshness),
        generationMode: generation.mode,
        model: generation.model,
        provider: generation.provider,
        fallbackReason: generation.fallbackReason,
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
      investmentRelated,
      generationMode: generation.mode,
      generationFallbackReason: generation.fallbackReason,
      model: generation.model,
      provider: generation.provider,
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

function generationMetadata(resultSummary: Record<string, unknown> | null | undefined) {
  const generationMode = resultSummary?.generationMode;
  const generationFallbackReason = resultSummary?.fallbackReason;
  const model = resultSummary?.model;
  return {
    generationMode:
      generationMode === "VERCEL_AI_GATEWAY" ||
      generationMode === "OPENAI" ||
      generationMode === "CUSTOM_AI" ||
      generationMode === "DETERMINISTIC"
        ? generationMode
        : undefined,
    generationFallbackReason:
      generationFallbackReason === "NOT_CONFIGURED" ||
      generationFallbackReason === "PROVIDER_AUTHENTICATION" ||
      generationFallbackReason === "PROVIDER_BILLING" ||
      generationFallbackReason === "PROVIDER_RATE_LIMIT" ||
      generationFallbackReason === "PROVIDER_ERROR" ||
      generationFallbackReason === "EMPTY_RESPONSE" ||
      generationFallbackReason === "UNSAFE_RESPONSE"
        ? generationFallbackReason
        : undefined,
    model: typeof model === "string" ? model : undefined,
    provider: typeof resultSummary?.provider === "string" ? resultSummary.provider : undefined,
  };
}

function isInvestmentRelated(question: string, selected: boolean) {
  return selected || /\b(invest|buy|sell|trade|signal|allocate|allocation|rebalance|liquidate|position|portfolio|holding|exposure|risk|return|profit|loss|pnl|btc|bitcoin)\b/i.test(question);
}
