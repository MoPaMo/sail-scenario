import { NextResponse, type NextRequest } from "next/server";
import { emailEnabled, sendWithResend, siteUrl } from "@/lib/email";
import { clientIp } from "@/lib/http";
import { getStore, toPublic } from "@/lib/store";
import { handleSubmission } from "@/lib/submit";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_000;

/** GET /api/scenarios?offset=0&limit=24 — newest first. */
export async function GET(req: NextRequest) {
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  const limit = Math.min(48, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 24));
  const { items, total } = await getStore().list(offset, limit);
  return NextResponse.json({ items: items.map(toPublic), total, offset, limit });
}

/** POST /api/scenarios — publish a scenario (captcha + profanity + rule checks, optional edit link by email). */
export async function POST(req: NextRequest) {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "That request is too large." }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Send the scenario as JSON." }, { status: 400 });
  }
  const result = await handleSubmission(json, clientIp(req), {
    store: getStore(),
    verify: verifyTurnstile,
    mailer: emailEnabled() ? sendWithResend : undefined,
    siteUrl: siteUrl(),
  });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
