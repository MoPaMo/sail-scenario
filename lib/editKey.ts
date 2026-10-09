import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Private edit keys. The key travels only in the emailed link (in the URL
 * fragment, which browsers never send to the server or in Referer headers);
 * the server stores just its SHA-256 hash, so a database leak can't be turned
 * into edit access.
 */

export function createEditKey(): { key: string; hash: string } {
  const key = randomBytes(32).toString("base64url"); // 256 bits
  return { key, hash: hashEditKey(key) };
}

export function hashEditKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function editKeyMatches(key: unknown, hash: string | undefined): boolean {
  if (typeof key !== "string" || !hash || key.length < 20 || key.length > 100) return false;
  const a = Buffer.from(hashEditKey(key), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerKey(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}
