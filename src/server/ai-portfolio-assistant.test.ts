import { describe, expect, it, vi } from "vitest";
import { buildAssistantReply } from "@/lib/assistant";
import { createDemoData } from "@/lib/seed";
import {
  buildPortfolioModelContext,
  extractResponseText,
  generateAssistantAnswer,
  validateModelResponse,
} from "@/server/ai-portfolio-assistant";

const seed = createDemoData(new Date("2026-07-10T12:00:00.000Z").getTime());
const context = {
  transactions: seed.transactions,
  spending: seed.spending,
  prices: seed.prices,
  signals: seed.signals,
  events: seed.events,
  fxRates: seed.fxRates,
};
const groundedReply = buildAssistantReply("What is my portfolio worth?", context);

describe("AI portfolio assistant", () => {
  it("keeps private identifiers and notes out of model context", () => {
    const modelContext = buildPortfolioModelContext({
      question: "Summarize my portfolio",
      context,
      groundedReply,
    });
    const serialized = JSON.stringify(modelContext);

    expect(serialized).not.toContain(seed.transactions[0].id);
    expect(serialized).not.toContain("fingerprint");
    expect(serialized).not.toContain("note");
    expect(modelContext.portfolio.holdings.length).toBeGreaterThan(0);
  });

  it("uses full-ledger aggregates while retrieving only question-relevant transaction rows", () => {
    const modelContext = buildPortfolioModelContext({
      question: "Review my BTC transaction history",
      context,
      groundedReply,
    });

    expect(modelContext.portfolioTransactionLedger.totalRecords).toBe(context.transactions.length);
    expect(modelContext.portfolioTransactionCoverage.filters.asset).toBe("BTC");
    expect(modelContext.portfolioTransactions.every((row) => row.assetSymbol === "BTC")).toBe(true);
    expect(modelContext.spendingLedger.totalRecords).toBe(context.spending.length);
    expect(modelContext.instructionsForDataUse).toContain("full-dataset aggregates");
  });

  it("does not turn an arbitrary question into the deterministic portfolio summary", () => {
    const question = "How did my portfolio change compared with last year?";
    const modelContext = buildPortfolioModelContext({
      question,
      context,
      groundedReply: buildAssistantReply(question, context),
    });

    expect(modelContext.questionIntent).toBe("GENERAL");
    expect(modelContext.deterministicSelector.answer).toBeUndefined();
    expect(modelContext.deterministicSelector.relevance).toContain("exact question");
  });

  it("uses the latest all-assets Monthly History snapshot for total portfolio value", () => {
    const reply = buildAssistantReply("What is my total portfolio value today?", {
      ...context,
      displayCurrency: "IDR",
      portfolioRecap: {
        snapshots: [{
          asOfDate: "2026-07-31",
          bankIdr: "700000",
          rdpuIdr: "0",
          ihsgIdr: "0",
          sp500Idr: "0",
          btcIdr: "200000",
          ethIdr: "100000",
          altcoinIdr: "0",
          goldIdr: "0",
          idrPerUsd: "16000",
        }],
        latestSummary: { totalIdr: "1000000" },
      },
    } as never);

    expect(reply.content).toContain("1,000,000");
    expect(reply.content).toContain("2026-07-31");
    expect(reply.content).toContain("Monthly History");
    expect(reply.content).not.toContain("crypto ledger alone");
  });

  it("routes cash and key-action questions to an action answer instead of portfolio total", () => {
    const reply = buildAssistantReply(
      "Please give a key action for my portfolio today and if I have $120 cash, what should I do with this money?",
      {
        ...context,
        displayCurrency: "USD",
        portfolioRecap: {
          snapshots: [{
            asOfDate: "2026-07-31",
            bankIdr: "16000000",
            rdpuIdr: "0",
            ihsgIdr: "0",
            sp500Idr: "0",
            btcIdr: "10000000",
            ethIdr: "0",
            altcoinIdr: "0",
            goldIdr: "0",
            idrPerUsd: "16000",
          }],
          latestSummary: { totalIdr: "26000000" },
        },
      } as never,
    );

    expect(reply.toolName).toBe("getDataQualityReport");
    expect(reply.content).toContain("$120");
    expect(reply.content).toContain("reconcile");
    expect(reply.content).not.toContain("Your total portfolio value");

    const modelContext = buildPortfolioModelContext({
      question: "Please give a key action for my portfolio today and if I have $120 cash, what should I do with this money?",
      context,
      groundedReply: reply,
    });
    expect(modelContext.questionIntent).toBe("KEY_ACTION");
    expect(modelContext.deterministicSelector.answer).toContain("$120");
  });

  it("resolves a short follow-up against the previous user question", () => {
    const previousQuestion = "Please give a key action for my portfolio today and if I have $120 cash, what should I do with this money?";
    const followUp = "What about it?";
    const followUpContext = {
      ...context,
      displayCurrency: "USD" as const,
      conversationHistory: [{ role: "USER" as const, content: previousQuestion }],
    };
    const reply = buildAssistantReply(followUp, followUpContext);

    expect(reply.toolName).toBe("getDataQualityReport");
    expect(reply.content).toContain("$120");
    const modelContext = buildPortfolioModelContext({
      question: followUp,
      context: followUpContext,
      groundedReply: reply,
      history: [{ role: "USER", content: previousQuestion }],
    });
    expect(modelContext.questionIntent).toBe("KEY_ACTION");
    expect(modelContext.priorConversation).toEqual([{ role: "USER", content: previousQuestion }]);
  });

  it("uses deterministic output when an API key is not configured", async () => {
    const result = await generateAssistantAnswer({
      question: "What is my portfolio worth?",
      context,
      groundedReply,
      gatewayToken: "",
      apiKey: "",
    });

    expect(result.mode).toBe("DETERMINISTIC");
    expect(result.fallbackReason).toBe("NOT_CONFIGURED");
    expect(result.reply).toEqual(groundedReply);
  });

  it("uses response output text without changing verified receipts", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: "Grounded model answer." }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await generateAssistantAnswer({
      question: "Compare my BTC exposure with the rest",
      context,
      groundedReply,
      gatewayToken: "",
      apiKey: "test-key",
      model: "test-model",
      fetcher,
    });

    expect(result.mode).toBe("OPENAI");
    expect(result.reply.content).toBe("Grounded model answer.");
    expect(result.reply.sources).toEqual(groundedReply.sources);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses an encrypted-user-configured Anthropic model through the Messages API shape", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
      expect(new Headers(request?.headers).get("x-api-key")).toBe("claude-key");
      expect(new Headers(request?.headers).get("anthropic-version")).toBe("2023-06-01");
      const body = JSON.parse(String(request?.body)) as { model: string; messages: unknown[] };
      expect(body.model).toBe("claude-test");
      expect(body.messages).toHaveLength(1);
      return new Response(JSON.stringify({ content: [{ type: "text", text: "Claude answer." }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await generateAssistantAnswer({
      question: "Explain my risk",
      context,
      groundedReply,
      customConfig: {
        label: "My Claude",
        provider: "ANTHROPIC",
        model: "claude-test",
        endpointUrl: "https://api.anthropic.com/v1/messages",
        apiKey: "claude-key",
      },
      fetcher,
    });

    expect(result.mode).toBe("CUSTOM_AI");
    expect(result.provider).toBe("My Claude");
    expect(result.reply.content).toBe("Claude answer.");
  });

  it("uses Kimi and other OpenAI-compatible models through chat completions", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
      const body = JSON.parse(String(request?.body)) as { model: string; messages: unknown[] };
      expect(body.model).toBe("kimi-test");
      expect(body.messages).toHaveLength(2);
      return new Response(JSON.stringify({ choices: [{ message: { content: "Kimi answer." } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await generateAssistantAnswer({
      question: "Explain my risk",
      context,
      groundedReply,
      customConfig: {
        label: "My Kimi",
        provider: "KIMI",
        model: "kimi-test",
        endpointUrl: "https://api.moonshot.ai/v1/chat/completions",
        apiKey: "kimi-key",
      },
      fetcher,
    });

    expect(result.mode).toBe("CUSTOM_AI");
    expect(result.provider).toBe("My Kimi");
    expect(result.reply.content).toBe("Kimi answer.");
  });

  it("uses the ChatGPT OAuth Codex request shape without exposing the token", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, request?: RequestInit) => {
      expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
      const headers = new Headers(request?.headers);
      expect(headers.get("authorization")).toBe("Bearer oauth-access-token");
      expect(headers.get("originator")).toBe("codex_cli_rs");
      expect(headers.get("ChatGPT-Account-ID")).toBe("account-123");
      const body = JSON.parse(String(request?.body)) as {
        model: string;
        instructions: string;
        input: Array<{ role: string }>;
      };
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.instructions).toContain("Coin Terminal");
      expect(body.input).toEqual([{ type: "message", role: "user", content: expect.any(String) }]);
      return new Response(JSON.stringify({ output_text: "Codex answer." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await generateAssistantAnswer({
      question: "Explain my risk",
      context,
      groundedReply,
      customConfig: {
        label: "ChatGPT / Codex",
        provider: "OPENAI_CODEX",
        model: "gpt-5.6-luna",
        endpointUrl: "https://chatgpt.com/backend-api/codex/responses",
        apiKey: "oauth-access-token",
        accountId: "account-123",
      },
      fetcher,
    });

    expect(result.mode).toBe("CUSTOM_AI");
    expect(result.provider).toBe("ChatGPT / Codex");
    expect(result.reply.content).toBe("Codex answer.");
  });

  it("prefers Vercel AI Gateway and sends developer rules separately from data", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, request?: RequestInit) => {
      void url;
      void request;
      return new Response(JSON.stringify({ output_text: "Gateway answer." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await generateAssistantAnswer({
      question: "Explain my risk",
      context,
      groundedReply,
      gatewayToken: "oidc-token",
      gatewayModel: "openai/test-gateway-model",
      apiKey: "",
      fetcher,
    });
    const [url, request] = fetcher.mock.calls[0];
    const body = JSON.parse(String(request?.body)) as {
      model: string;
      input: Array<{ role: string; content: string }>;
      store?: boolean;
    };

    expect(result.mode).toBe("VERCEL_AI_GATEWAY");
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/responses");
    expect(body.model).toBe("openai/test-gateway-model");
    expect(body.input[0].role).toBe("user");
    expect(body.store).toBeUndefined();
  });

  it("falls through from a failed gateway request to direct OpenAI", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("ai-gateway")
        ? new Response("unavailable", { status: 503 })
        : new Response(JSON.stringify({ output_text: "Direct fallback answer." }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
    );
    const result = await generateAssistantAnswer({
      question: "Explain my risk",
      context,
      groundedReply,
      gatewayToken: "oidc-token",
      apiKey: "openai-key",
      model: "direct-model",
      fetcher,
    });

    expect(result.mode).toBe("OPENAI");
    expect(result.model).toBe("direct-model");
    expect(result.reply.content).toBe("Direct fallback answer.");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("records Vercel customer verification as a billing setup fallback", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { type: "customer_verification_required" } }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await generateAssistantAnswer({
      question: "Explain my risk",
      context,
      groundedReply,
      gatewayToken: "oidc-token",
      apiKey: "",
      fetcher,
    });

    expect(result.mode).toBe("DETERMINISTIC");
    expect(result.fallbackReason).toBe("PROVIDER_BILLING");
  });

  it("rejects direct trading instructions from a model and preserves the grounded answer", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ output_text: "You should buy 0.5 BTC immediately for a guaranteed return." }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await generateAssistantAnswer({
      question: "Explain my BTC exposure",
      context,
      groundedReply,
      gatewayToken: "oidc-token",
      apiKey: "",
      fetcher,
    });

    expect(result.mode).toBe("DETERMINISTIC");
    expect(result.fallbackReason).toBe("SAFETY_REWRITE_FAILED");
    expect(result.reply).toEqual(groundedReply);
  });

  it("extracts the convenience output_text field", () => {
    expect(extractResponseText({ output_text: "  Answer  " })).toBe("Answer");
  });

  it("allows conditional nominal scenarios while rejecting execution and guarantees", () => {
    expect(validateModelResponse("Option A: keep $120 as cash; Option B: conditionally allocate part after checking concentration and liquidity.")).toBe("PASSED");
    expect(validateModelResponse("Execute a buy order for BTC now; returns are guaranteed.")).toBe("REJECTED");
  });

  it("runs a planner and native public web step without leaking private cash into the query", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
      const body = JSON.parse(String(request?.body)) as { input?: Array<{ content?: string }>; tools?: unknown[] };
      const content = body.input?.[0]?.content ?? "";
      if (body.tools) {
        expect(content).not.toContain("120");
        expect(content).not.toContain("cash");
        expect(content).not.toContain("portfolio");
        expect(content).not.toContain("balance");
        return new Response(JSON.stringify({ output_text: "BTC public market context: https://example.com/market" }), { status: 200 });
      }
      if (content.includes("availableAssets")) {
        return new Response(JSON.stringify({ output_text: JSON.stringify({ intent: "RECOMMEND", assets: ["BTC"], tools: ["getPortfolioSummary", "getDataQualityReport"], needsWeb: true, webQueries: ["BTC latest market context for my portfolio with $120 balance"], answerGoal: "Give a conditional action for my $120 cash." }) }), { status: 200 });
      }
      expect(content).toContain("webEvidence");
      return new Response(JSON.stringify({ output_text: "Keep the answer conditional and verify concentration before choosing a cash scenario." }), { status: 200 });
    });
    const result = await generateAssistantAnswer({
      question: "Give me a key action and what should I do with my $120 cash?",
      context,
      groundedReply: buildAssistantReply("Give me a key action and what should I do with my $120 cash?", context),
      apiKey: "test-key",
      model: "gpt-5.6-luna",
      fetcher,
    });

    expect(result.reply.content).toContain("conditional");
    expect(result.webMode).toBe("NATIVE");
    expect(result.validationOutcome).toBe("PASSED");
    expect(result.toolsUsed).toContain("getPortfolioSummary");
    expect(result.reply.sources.some((source) => source.kind === "WEB_PUBLIC")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("falls back to a curated CoinGecko snapshot when native web search is unavailable", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, request?: RequestInit) => {
      const body = JSON.parse(String(request?.body ?? "{}")) as { input?: Array<{ content?: string }>; tools?: unknown[] };
      if (body.tools) return new Response("unsupported", { status: 400 });
      if (String(url).includes("coingecko.com")) return new Response(JSON.stringify({ bitcoin: { usd: 100, usd_24h_change: 1.2 } }), { status: 200 });
      const content = body.input?.[0]?.content ?? "";
      if (content.includes("availableAssets")) return new Response(JSON.stringify({ output_text: JSON.stringify({ intent: "ANALYZE", assets: ["BTC"], tools: ["getAssetPerformance"], needsWeb: true, webQueries: ["BTC latest market context"], answerGoal: "Explain BTC market context." }) }), { status: 200 });
      return new Response(JSON.stringify({ output_text: "BTC is up 1.20% in the curated public snapshot." }), { status: 200 });
    });
    const result = await generateAssistantAnswer({
      question: "What is the latest BTC market context?",
      context,
      groundedReply: buildAssistantReply("What is the latest BTC market context?", context),
      apiKey: "test-key",
      model: "gpt-5.6-luna",
      fetcher,
    });

    expect(result.webMode).toBe("CURATED");
    expect(result.reply.content).toContain("curated");
    expect(result.reply.sources.some((source) => source.kind === "WEB_PUBLIC")).toBe(true);
  });
});
