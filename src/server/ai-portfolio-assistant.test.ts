import { describe, expect, it, vi } from "vitest";
import { buildAssistantReply } from "@/lib/assistant";
import { createDemoData } from "@/lib/seed";
import {
  buildPortfolioModelContext,
  extractResponseText,
  generateAssistantAnswer,
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
    expect(fetcher).toHaveBeenCalledOnce();
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
      expect(body.instructions).toContain("Coin Terminal's grounded portfolio assistant");
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
    expect(body.input[0].role).toBe("developer");
    expect(body.input[1].role).toBe("user");
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
    expect(fetcher).toHaveBeenCalledTimes(2);
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
    expect(result.fallbackReason).toBe("UNSAFE_RESPONSE");
    expect(result.reply).toEqual(groundedReply);
  });

  it("extracts the convenience output_text field", () => {
    expect(extractResponseText({ output_text: "  Answer  " })).toBe("Answer");
  });
});
