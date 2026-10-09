/**
 * Cloudflare Turnstile (captcha) — server-side verification.
 *
 * Keys come from the environment:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (public, used by the widget)
 *   TURNSTILE_SECRET_KEY            (private, used here)
 *
 * With neither set, Cloudflare's official test keys are used, which always
 * pass. The submit dialog then shows that the captcha is in test mode, so a
 * deploy without real keys is never mistaken for a protected one.
 */

export const TEST_SITE_KEY = "1x00000000000000000000AA";
export const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaMode = "live" | "test" | "misconfigured";

export function captchaMode(): CaptchaMode {
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (site && secret) return "live";
  if (!site && !secret) return "test";
  return "misconfigured";
}

export function publicSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY;
}

function secretKey(): string {
  return process.env.TURNSTILE_SECRET_KEY || TEST_SECRET_KEY;
}

export interface CaptchaResult {
  success: boolean;
  codes: string[];
}

export type CaptchaVerifier = (token: string, ip: string | null) => Promise<CaptchaResult>;

export const verifyTurnstile: CaptchaVerifier = async (token, ip) => {
  if (!token || token.length > 2048) return { success: false, codes: ["missing-input-response"] };
  const body = new FormData();
  body.append("secret", secretKey());
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    return { success: data.success === true, codes: data["error-codes"] ?? [] };
  } catch {
    return { success: false, codes: ["verification-unavailable"] };
  }
};
