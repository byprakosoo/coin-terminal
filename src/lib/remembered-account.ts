"use client";

export const REMEMBERED_ACCOUNT_COOKIE = "coin-terminal-remembered-account";
const REMEMBERED_ACCOUNT_MAX_AGE = 60 * 60 * 24 * 30;

export function getRememberedAccount() {
  if (typeof document === "undefined") return "";
  return parseRememberedAccountCookie(document.cookie) ?? "";
}

export function rememberAccount(email: string) {
  if (typeof document === "undefined") return;
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return;

  document.cookie = [
    `${REMEMBERED_ACCOUNT_COOKIE}=${encodeURIComponent(normalizedEmail)}`,
    `Max-Age=${REMEMBERED_ACCOUNT_MAX_AGE}`,
    "Path=/",
    "SameSite=Lax",
  ].join("; ");
}

export function forgetRememberedAccount() {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBERED_ACCOUNT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function parseRememberedAccountCookie(cookieHeader: string) {
  const prefix = `${REMEMBERED_ACCOUNT_COOKIE}=`;
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!match) return undefined;

  try {
    const email = decodeURIComponent(match.slice(prefix.length)).trim();
    return email || undefined;
  } catch {
    return undefined;
  }
}
