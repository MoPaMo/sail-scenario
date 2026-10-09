import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getStore, ID_RE } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const rec = await getStore().get(id);
  if (!rec) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json(rec);
}

/** DELETE /api/scenarios/:id with "Authorization: Bearer $ADMIN_TOKEN" — for moderation. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const adminToken = process.env.ADMIN_TOKEN;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const authorized =
    !!adminToken &&
    adminToken.length >= 16 &&
    given.length === adminToken.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(adminToken));
  if (!authorized) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const removed = await getStore().remove(id);
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}
