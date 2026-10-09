import { siteUrl } from "@/lib/email";
import { OFFICIAL_SCENARIOS } from "@/lib/official";
import { siteShareImage } from "@/lib/shareImage";

// Rendered once at build time and served as a static file.
export const dynamic = "force-static";

export async function GET() {
  const sample = OFFICIAL_SCENARIOS.find((s) => s.slug === "scenario-3")!.layout;
  return siteShareImage(sample, new URL(siteUrl()).host);
}
