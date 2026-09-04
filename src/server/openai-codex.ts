import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { aiModelConfigs, aiOauthDeviceLogins } from "@/db/schema";
import { env } from "@/lib/env";
import { normalizeOpenAiCodexUsage } from "@/lib/ai-usage";
import type { AiUsageSummary } from "@/lib/ai-usage";
import { ApiError } from "@/server/api";
import { createId } from "@/server/ids";

const deviceCodeUrl = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const deviceTokenUrl = "https://auth.openai.com/api/accounts/deviceauth/token";
const oauthTokenUrl = "https://auth.openai.com/oauth/token";
const verificationUrl = "https://auth.openai.com/codex/device";
const codexRedirectUri = "https://auth.openai.com/deviceauth/callback";
const defaultModel = "gpt-5.6-luna";

export interface OpenAiCodexCredential {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  accountId?: string;
  expiresAt?: number;
}

export interface OpenAiCodexUsageCredential {
  accessToken: string;
  accountId?: string;
}

export interface CodexDeviceLoginStart {
  loginId: string;
  verificationUrl: string;
  userCode: string;
  expiresAt: string;
}

export interface CodexDeviceLoginStatus {
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
  verificationUrl?: string;
  userCode?: string;
  expiresAt?: string;
}

export async function startOpenAiCodexDeviceLogin(userId: string): Promise<CodexDeviceLoginStart> {
  const recent = await db
    .select({ createdAt: aiOauthDeviceLogins.createdAt })
    .from(aiOauthDeviceLogins)
    .where(and(eq(aiOauthDeviceLogins.userId, userId), gte(aiOauthDeviceLogins.createdAt, new Date(Date.now() - 15 * 60_000))))
    .orderBy(desc(aiOauthDeviceLogins.createdAt));
  if (recent.length >= 3) {
    throw new ApiError(429, "Too many ChatGPT login attempts. Try again in a few minutes.", "OAUTH_RATE_LIMIT");
  }

  const response = await fetchWithTimeout(deviceCodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.openAiCodexClientId }),
  });
  if (!response.ok) {
    throw new ApiError(
      503,
      "ChatGPT device login is not available for this deployment or account.",
      "OPENAI_CODEX_UNAVAILABLE",
    );
  }
  const payload = await readJson(response) as {
    device_auth_id?: string;
    user_code?: string;
    expires_in?: number;
  };
  if (!payload.device_auth_id || !payload.user_code) {
    throw new ApiError(503, "OpenAI returned an incomplete login challenge.", "OPENAI_CODEX_UNAVAILABLE");
  }

  const expiresAt = new Date(Date.now() + Math.max(60, payload.expires_in ?? 900) * 1000);
  const loginId = createId();
  await db.insert(aiOauthDeviceLogins).values({
    id: loginId,
    userId,
    provider: "OPENAI_CODEX",
    deviceAuthId: payload.device_auth_id,
    userCode: payload.user_code,
    status: "PENDING",
    expiresAt,
  });
  return { loginId, verificationUrl, userCode: payload.user_code, expiresAt: expiresAt.toISOString() };
}

export async function pollOpenAiCodexDeviceLogin(userId: string, loginId: string): Promise<CodexDeviceLoginStatus> {
  const [login] = await db
    .select()
    .from(aiOauthDeviceLogins)
    .where(and(eq(aiOauthDeviceLogins.id, loginId), eq(aiOauthDeviceLogins.userId, userId)))
    .limit(1);
  if (!login) throw new ApiError(404, "ChatGPT login challenge not found.", "NOT_FOUND");
  if (login.status !== "PENDING") {
    return { status: login.status, verificationUrl, userCode: login.userCode, expiresAt: login.expiresAt.toISOString() };
  }
  if (login.expiresAt.getTime() <= Date.now()) {
    await db.update(aiOauthDeviceLogins).set({ status: "EXPIRED" }).where(eq(aiOauthDeviceLogins.id, login.id));
    return { status: "EXPIRED", verificationUrl, userCode: login.userCode, expiresAt: login.expiresAt.toISOString() };
  }

  const deviceResponse = await fetchWithTimeout(deviceTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_auth_id: login.deviceAuthId, user_code: login.userCode }),
  });
  if (deviceResponse.status === 403 || deviceResponse.status === 404 || deviceResponse.status === 409) {
    return { status: "PENDING", verificationUrl, userCode: login.userCode, expiresAt: login.expiresAt.toISOString() };
  }
  if (!deviceResponse.ok) {
    await markDeviceLoginFailed(login.id);
    throw new ApiError(502, "OpenAI could not complete the ChatGPT login.", "OPENAI_CODEX_LOGIN_FAILED");
  }

  const devicePayload = await readJson(deviceResponse) as {
    authorization_code?: string;
    code_verifier?: string;
  };
  if (!devicePayload.authorization_code || !devicePayload.code_verifier) {
    await markDeviceLoginFailed(login.id);
    throw new ApiError(502, "OpenAI returned an incomplete ChatGPT login result.", "OPENAI_CODEX_LOGIN_FAILED");
  }

  const tokenResponse = await fetchWithTimeout(oauthTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: devicePayload.authorization_code,
      redirect_uri: codexRedirectUri,
      client_id: env.openAiCodexClientId,
      code_verifier: devicePayload.code_verifier,
    }).toString(),
  });
  if (!tokenResponse.ok) {
    await markDeviceLoginFailed(login.id);
    throw new ApiError(502, "OpenAI could not issue a ChatGPT session for Coin Terminal.", "OPENAI_CODEX_LOGIN_FAILED");
  }
  const tokenPayload = await readJson(tokenResponse) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };
  if (!tokenPayload.access_token || !tokenPayload.refresh_token) {
    await markDeviceLoginFailed(login.id);
    throw new ApiError(502, "OpenAI returned incomplete ChatGPT credentials.", "OPENAI_CODEX_LOGIN_FAILED");
  }

  const credential: OpenAiCodexCredential = {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    idToken: tokenPayload.id_token,
    accountId: extractAccountId(tokenPayload.id_token) ?? extractAccountId(tokenPayload.access_token),
    expiresAt: tokenPayload.expires_in ? Date.now() + tokenPayload.expires_in * 1000 : jwtExpiry(tokenPayload.access_token),
  };
  const existing = (await db
    .select()
    .from(aiModelConfigs)
    .where(and(eq(aiModelConfigs.userId, userId), eq(aiModelConfigs.provider, "OPENAI_CODEX")))
    .limit(1))[0];
  const configId = existing?.id ?? createId();
  await db.transaction(async (tx) => {
    await tx.update(aiModelConfigs).set({ active: false }).where(eq(aiModelConfigs.userId, userId));
    if (existing) {
      await tx.update(aiModelConfigs).set({
        label: "ChatGPT / Codex",
        model: defaultModel,
        endpointUrl: `${env.openAiCodexBaseUrl}/responses`,
        apiKeyCiphertext: encryptCredential(JSON.stringify(credential)),
        apiKeyHint: "OAuth",
        active: true,
      }).where(and(eq(aiModelConfigs.id, configId), eq(aiModelConfigs.userId, userId)));
    } else {
      await tx.insert(aiModelConfigs).values({
        id: configId,
        userId,
        label: "ChatGPT / Codex",
        provider: "OPENAI_CODEX",
        model: defaultModel,
        endpointUrl: `${env.openAiCodexBaseUrl}/responses`,
        apiKeyCiphertext: encryptCredential(JSON.stringify(credential)),
        apiKeyHint: "OAuth",
        active: true,
      });
    }
    await tx.update(aiOauthDeviceLogins).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(aiOauthDeviceLogins.id, login.id));
  });
  return { status: "COMPLETED", verificationUrl, userCode: login.userCode, expiresAt: login.expiresAt.toISOString() };
}

export async function getOpenAiCodexCredential(row: typeof aiModelConfigs.$inferSelect) {
  let credential: OpenAiCodexCredential;
  try {
    credential = JSON.parse(decryptCredential(row.apiKeyCiphertext)) as OpenAiCodexCredential;
  } catch {
    throw new ApiError(503, "The saved ChatGPT connection cannot be decrypted. Connect ChatGPT again.", "AI_CREDENTIALS_UNAVAILABLE");
  }
  if (!credential.accessToken || !credential.refreshToken) {
    throw new ApiError(503, "The saved ChatGPT connection is incomplete. Connect ChatGPT again.", "AI_CREDENTIALS_UNAVAILABLE");
  }
  if (!credential.expiresAt || credential.expiresAt > Date.now() + 120_000) return credential;

  const response = await fetchWithTimeout(oauthTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken,
      client_id: env.openAiCodexClientId,
    }).toString(),
  });
  if (!response.ok) {
    throw new ApiError(503, "The ChatGPT connection expired. Connect ChatGPT again.", "AI_CREDENTIALS_EXPIRED");
  }
  const payload = await readJson(response) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) throw new ApiError(503, "OpenAI returned an invalid refreshed session.", "AI_CREDENTIALS_EXPIRED");
  const refreshed: OpenAiCodexCredential = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? credential.refreshToken,
    idToken: payload.id_token ?? credential.idToken,
    accountId: extractAccountId(payload.id_token) ?? credential.accountId,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : jwtExpiry(payload.access_token),
  };
  await db.update(aiModelConfigs).set({
    apiKeyCiphertext: encryptCredential(JSON.stringify(refreshed)),
    apiKeyHint: "OAuth",
  }).where(eq(aiModelConfigs.id, row.id));
  return refreshed;
}

export async function getOpenAiCodexUsage(credential: OpenAiCodexUsageCredential): Promise<AiUsageSummary> {
  const observedAt = new Date().toISOString();
  try {
    const response = await fetchWithTimeout(openAiCodexUsageUrl(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${credential.accessToken}`,
        originator: "codex_cli_rs",
        "user-agent": "codex_cli_rs/0.0.0 (Coin Terminal)",
        ...(credential.accountId ? { "ChatGPT-Account-ID": credential.accountId } : {}),
      },
    });
    if (response.status === 401 || response.status === 403) {
      return unavailableUsage("The ChatGPT connection is no longer authorized. Connect ChatGPT again.", observedAt);
    }
    if (!response.ok) {
      return unavailableUsage(`ChatGPT usage is temporarily unavailable (HTTP ${response.status}).`, observedAt);
    }
    return normalizeOpenAiCodexUsage(await response.json(), observedAt);
  } catch (error) {
    if (error instanceof ApiError && error.code === "AI_CREDENTIALS_EXPIRED") {
      return unavailableUsage("The ChatGPT connection expired. Connect ChatGPT again.", observedAt);
    }
    return unavailableUsage("ChatGPT usage is temporarily unavailable. Refresh and try again.", observedAt);
  }
}

export function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${authTag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptCredential(value: string) {
  const [version, ivValue, authTagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !authTagValue || !ciphertextValue) throw new Error("Invalid encrypted credential.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

async function markDeviceLoginFailed(id: string) {
  await db.update(aiOauthDeviceLogins).set({ status: "FAILED" }).where(eq(aiOauthDeviceLogins.id, id));
}

function openAiCodexUsageUrl() {
  const base = new URL(env.openAiCodexBaseUrl);
  const usagePath = base.pathname.replace(/\/codex\/?$/, "/wham/usage");
  return `${base.origin}${usagePath === base.pathname ? "/backend-api/wham/usage" : usagePath}`;
}

function unavailableUsage(message: string, observedAt: string): AiUsageSummary {
  return { availability: "UNAVAILABLE", observedAt, message };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(503, "OpenAI login is temporarily unavailable. Try again.", "OPENAI_CODEX_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new ApiError(502, "OpenAI returned an unreadable login response.", "OPENAI_CODEX_LOGIN_FAILED");
  }
}

function encryptionKey() {
  return createHash("sha256")
    .update(env.aiCredentialsEncryptionKey ?? env.betterAuthSecret)
    .update("coin-terminal:ai-model-config")
    .digest();
}

function jwtExpiry(token: string) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === "number" ? payload.exp * 1000 : undefined;
}

function extractAccountId(token: string | undefined) {
  const payload = token ? decodeJwtPayload(token) : undefined;
  const value = payload?.chatgpt_account_id ?? payload?.["https://api.openai.com/auth.chatgpt_account_id"] ?? payload?.account_id;
  return typeof value === "string" && value.length <= 255 ? value : undefined;
}

function decodeJwtPayload(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return undefined;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
