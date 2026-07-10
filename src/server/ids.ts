import "server-only";
import { createHash } from "node:crypto";

export function createId() {
  return crypto.randomUUID();
}

export function stableId(namespace: string, key: string) {
  const hash = createHash("sha256").update(`${namespace}:${key}`).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

export function fingerprint(userId: string, parts: Array<string | undefined | null>) {
  return createHash("sha256")
    .update([userId, ...parts.map((part) => part ?? "")].join("|"))
    .digest("hex");
}

export function payloadHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
