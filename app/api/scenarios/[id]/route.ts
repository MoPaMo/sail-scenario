import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { bearerKey } from "@/lib/editKey";
import { clientIp } from "@/lib/http";
import { getStore, ID_RE, toPublic } from "@/lib/store";
import { handleOwnerDelete, handleUpdate } from "@/lib/submit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BODY_BYTES = 16_000;
const noStore = { "Cache-Control": "no-store" };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const rec = await getStore().get(id);
  if (!rec) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json(toPublic(rec));
}

/** PATCH /api/scenarios/:id with "Authorization: Bearer <edit key>" — the author edits their scenario. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
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
  const result = await handleUpdate(id, bearerKey(req.headers.get("authorization")), json, clientIp(req), { store: getStore() });
  return NextResponse.json(result.body, { status: result.status, headers: noStore });
}

function isAdmin(req: NextRequest): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  const given = bearerKey(req.headers.get("authorization")) ?? "";
  return (
    !!adminToken &&
    adminToken.length >= 16 &&
    given.length === adminToken.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(adminToken))
  );
}

/**
 * DELETE /api/scenarios/:id with "Authorization: Bearer <token>", where the
 * token is either the author's edit key or ADMIN_TOKEN (moderation).
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (isAdmin(req)) {
    if (!ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    const removed = await getStore().remove(id);
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
  }
  const result = await handleOwnerDelete(id, bearerKey(req.headers.get("authorization")), clientIp(req), { store: getStore() });
  return NextResponse.json(result.body, { status: result.status, headers: noStore });
}
