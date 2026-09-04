import { describe, expect, it, vi } from "vitest";
import { buildAssistantReply } from "@/lib/assistant";
import { createDemoData } from "@/lib/seed";
import {
  buildPortfolioModelContext,
  extractResponseText,
  generateAssistantAnswer,
  testAiModelConnection,
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

  it("does not let an older question choose the asset for a new question", () => {
    const modelContext = buildPortfolioModelContext({
      question: "Review my ETH transaction history",
      context,
      groundedReply: buildAssistantReply("Review my ETH transaction history", context),
      history: [{ role: "USER", content: "Review my BTC transaction history" }],
    });

    expect(modelContext.portfolioTransactionCoverage.filters.asset).toBe("ETH");
    expect(modelContext.portfolioTransactions.every((row) => row.assetSymbol === "ETH")).toBe(true);
  });

  it("routes common Indonesian portfolio questions to matching deterministic data", () => {
    const indonesianContext = {
      ...context,
      displayCurrency: "IDR" as const,
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
    } as never;

    const total = buildAssistantReply("Berapa nilai total portofolio saya?", indonesianContext);
    const spending = buildAssistantReply("Berapa pengeluaran saya bulan ini?", indonesianContext);
    const transactions = buildAssistantReply("Apa transaksi beli BTC terbaru saya?", indonesianContext);

    expect(total.content).toContain("1,000,000");
    expect(total.content).toContain("Monthly History");
    expect(spending.toolName).toBe("getSpendingSummary");
    expect(transactions.toolName).toBe("getTransactions");
    expect(new Set([total.content, spending.content, transactions.content]).size).toBe(3);
  });

  it("answers gold questions from the gold ledger instead of the crypto summary", () => {
    const goldContext = {
      ...context,
      portfolioRecap: {
        snapshots: [],
        latestSummary: undefined,
        gold: {
          transactions: [{
            id: "gold-buy",
            transactionType: "BUY",
            occurredOn: "2026-07-01",
            goldType: "Antam 24K",
            grams: "5",
            unitPriceIdr: "2500000",
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          }],
          valuations: [],
          summary: {
            heldGrams: "5",
            valuationPricePerGramIdr: "2600000",
            valuationDate: "2026-07-31",
            marketValueIdr: "13000000",
            remainingCostBasisIdr: "12500000",
            averageCostPerGramIdr: "2500000",
            grossPurchaseCostIdr: "12500000",
            soldGrams: "0",
            saleProceedsIdr: "0",
            realizedPnlIdr: "0",
            unrealizedPnlIdr: "500000",
            unrealizedPnlPct: "4",
          },
        },
        annual: { settings: [], rows: [] },
        template: { available: false },
      },
    } as never;

    const reply = buildAssistantReply("Berapa total nilai emas yang saya punya?", goldContext);

    expect(reply.content).toContain("5 g");
    expect(reply.content).toContain("13,000,000");
    expect(reply.content).not.toContain("tracked portfolio is worth");
  });

  it("does not turn an arbitrary question into the deterministic portfolio summary", () => {
    const question = "How did my portfolio change compared with last year?";
    const deterministicReply = buildAssistantReply(question, context);
    const modelContext = buildPortfolioModelContext({
      question,
      context,
      groundedReply: deterministicReply,
    });

    expect(modelContext.questionIntent).toBe("GENERAL");
    expect(modelContext.deterministicSelector.answer).toBeUndefined();
    expect(modelContext.deterministicSelector.relevance).toContain("exact question");
    expect(modelContext.deterministicSelector.sourceReceipts[0]?.label).toBe("Authenticated portfolio question routing");
    expect(deterministicReply.content).toContain("map that question");
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

  it("keeps the no-model fallback specific to each question", async () => {
    const spendingQuestion = "How much did I spend this month?";
    const transactionQuestion = "What is my latest BTC transaction?";
    const [spending, transaction] = await Promise.all([
      generateAssistantAnswer({
        question: spendingQuestion,
        context,
        groundedReply: buildAssistantReply(spendingQuestion, context),
        gatewayToken: "",
        apiKey: "",
      }),
      generateAssistantAnswer({
        question: transactionQuestion,
        context,
        groundedReply: buildAssistantReply(transactionQuestion, context),
        gatewayToken: "",
        apiKey: "",
      }),
    ]);

    expect(spending.reply.toolName).toBe("getSpendingSummary");
    expect(transaction.reply.toolName).toBe("getTransactions");
    expect(spending.reply.content).not.toBe(transaction.reply.content);
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

  it("uses the external model with the goal-allocation context and a matching fallback", async () => {
    const question = "Berdasarkan tabungan dan alokasi portofolio gue saat ini, gimana cara pengalokasian yang baik berdasarkan tujuan keuangan gue.\n\n1. Daftar haji\n2. Dana pendidikan anak\n3. Beli mobil";
    const goalContext = {
      ...context,
      displayCurrency: "IDR" as const,
      portfolioRecap: {
        snapshots: [{
          id: "snapshot-1",
          asOfDate: "2026-07-31",
          sequence: 1,
          source: "MANUAL",
          bankIdr: "700000",
          rdpuIdr: "100000",
          ihsgIdr: "50000",
          sp500Idr: "0",
          btcIdr: "100000",
          ethIdr: "50000",
          altcoinIdr: "0",
          goldIdr: "0",
          idrPerUsd: "16000",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
        }],
        latestSummary: { totalIdr: "1000000" },
        gold: { transactions: [], valuations: [], summary: { heldGrams: "0", remainingCostBasisIdr: "0", averageCostPerGramIdr: "0", grossPurchaseCostIdr: "0", soldGrams: "0", saleProceedsIdr: "0", realizedPnlIdr: "0" } },
        annual: { settings: [], rows: [] },
        template: { available: false },
      },
    } as never;
    const fetcher = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
      const body = JSON.parse(String(request?.body)) as {
        input?: Array<{ content?: string }>;
        tools?: unknown[];
      };
      const content = body.input?.[0]?.content ?? "";
      expect(content).toContain("allAssetsPortfolio");
      expect(content).toContain("Daftar haji");
      expect(content).toContain("GOAL_ALLOCATION");
      expect(body.tools).toBeUndefined();
      return new Response(JSON.stringify({ output_text: "Pisahkan alokasi berdasarkan horizon setiap tujuan dan gunakan skenario yang tetap kondisional." }), { status: 200 });
    });

    const result = await generateAssistantAnswer({
      question,
      context: goalContext,
      groundedReply: buildAssistantReply(question, goalContext),
      customConfig: {
        label: "My OpenAI",
        provider: "OPENAI",
        model: "gpt-4o-mini",
        endpointUrl: "https://api.openai.com/v1/responses",
        apiKey: "openai-key",
      },
      fetcher,
    });

    expect(result.mode).toBe("CUSTOM_AI");
    expect(result.reply.content).toContain("horizon");
    expect(result.toolsUsed).toEqual(["getPortfolioSummary", "getDataQualityReport"]);
    expect(result.webMode).toBe("NONE");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not send reasoning options to non-reasoning OpenAI models", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
      const body = JSON.parse(String(request?.body)) as { model: string; reasoning?: unknown };
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.reasoning).toBeUndefined();
      return new Response(JSON.stringify({ output_text: "OpenAI answer." }), { status: 200 });
    });
    const result = await generateAssistantAnswer({
      question: "Explain my risk",
      context,
      groundedReply,
      customConfig: {
        label: "My OpenAI",
        provider: "OPENAI",
        model: "gpt-4o-mini",
        endpointUrl: "https://api.openai.com/v1/responses",
        apiKey: "openai-key",
      },
      fetcher,
    });

    expect(result.mode).toBe("CUSTOM_AI");
    expect(result.reply.content).toBe("OpenAI answer.");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("tests a saved provider without sending portfolio data", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
      const body = JSON.parse(String(request?.body)) as { input?: Array<{ content?: string }> };
      expect(body.input?.[0]?.content).toBe("Return only CONNECTION_OK.");
      return new Response(JSON.stringify({ output_text: "CONNECTION_OK" }), { status: 200 });
    });
    const result = await testAiModelConnection({
      label: "My OpenAI",
      provider: "OPENAI",
      model: "gpt-4o-mini",
      endpointUrl: "https://api.openai.com/v1/responses",
      apiKey: "openai-key",
    }, fetcher);

    expect(result.ok).toBe(true);
    expect(result.content).toBe("CONNECTION_OK");
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
        stream: boolean;
      };
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.instructions).toContain("Coin Terminal");
      expect(body.input).toEqual([{ type: "message", role: "user", content: expect.any(String) }]);
      expect(body.stream).toBe(true);
      return new Response('data: {"type":"response.output_text.delta","delta":"Codex answer."}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
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
