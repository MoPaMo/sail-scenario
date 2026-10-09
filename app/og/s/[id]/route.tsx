import { siteUrl } from "@/lib/email";
import { scenarioShareImage } from "@/lib/shareImage";
import { getStore, ID_RE } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Share image for one scenario. Pages link it as /og/s/<id>?v=<last change>,
 * so an edit gets a new URL and chat apps fetch the fresh image.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = ID_RE.test(id) ? await getStore().get(id) : null;
  if (!rec) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return scenarioShareImage({
    title: rec.title,
    author: rec.author,
    layout: rec.layout,
    columns: rec.stats.columns,
    host: new URL(siteUrl()).host,
  });
}
