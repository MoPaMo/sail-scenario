import { NextResponse, type NextRequest } from "next/server";
import { bearerKey } from "@/lib/editKey";
import { clientIp } from "@/lib/http";
import { getStore } from "@/lib/store";
import { handleAccess } from "@/lib/submit";

export const dynamic = "force-dynamic";

/** POST /api/scenarios/:id/access with "Authorization: Bearer <edit key>" — is this edit link valid? */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleAccess(id, bearerKey(req.headers.get("authorization")), clientIp(req), { store: getStore() });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
