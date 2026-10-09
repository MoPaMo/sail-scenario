import type { Metadata } from "next";
import type { ScenarioRecord } from "./store";

export const SITE_NAME = "Sail Scenario Workshop";

/** Image URL that changes whenever the scenario does, so previews never go stale. */
export function scenarioImageUrl(rec: Pick<ScenarioRecord, "id" | "createdAt" | "updatedAt">): string {
  const version = Date.parse(rec.updatedAt ?? rec.createdAt).toString(36);
  return `/og/s/${rec.id}?v=${version}`;
}

export function scenarioMetadata(rec: ScenarioRecord): Metadata {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const tokens = [
    count(rec.layout.islands.length, "island", "islands"),
    count(rec.layout.kraken.length, "kraken", "krakens"),
    count(rec.layout.storms.length, "storm", "storms"),
  ].join(", ");
  const description = `A custom scenario for Sail${rec.author ? ` by ${rec.author}` : ""}: ${rec.stats.columns} columns, ${tokens}. Open it to play, print the card or remix it.`;
  const image = { url: scenarioImageUrl(rec), width: 1200, height: 630, alt: `Map of the Sail scenario "${rec.title}"` };
  return {
    title: rec.title,
    description,
    alternates: { canonical: `/s/${rec.id}` },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: rec.title,
      description,
      url: `/s/${rec.id}`,
      images: [image],
      publishedTime: rec.createdAt,
      ...(rec.updatedAt ? { modifiedTime: rec.updatedAt } : {}),
      ...(rec.author ? { authors: [rec.author] } : {}),
    },
    twitter: { card: "summary_large_image", title: rec.title, description, images: [image] },
  };
}
