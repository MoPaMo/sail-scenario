import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ScenarioBody from "@/components/ScenarioBody";
import { analyze } from "@/lib/analysis";
import { formatDate } from "@/lib/format";
import { layoutToSearchParams } from "@/lib/scenario";
import { getStore, ID_RE } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!ID_RE.test(id)) return null;
  return getStore().get(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const rec = await load((await params).id);
  if (!rec) return { title: "Scenario not found" };
  return {
    title: rec.title,
    description: `A custom Sail scenario${rec.author ? ` by ${rec.author}` : ""}: ${rec.layout.islands.length} islands, ${rec.layout.kraken.length} krakens, ${rec.layout.storms.length} storm${rec.layout.storms.length === 1 ? "" : "s"}.`,
  };
}

export default async function ScenarioPage({ params }: Props) {
  const rec = await load((await params).id);
  if (!rec) notFound();
  const remixTitle = `${rec.title} remix`.slice(0, 60);

  return (
    <article className="detail">
      <div className="page-head">
        <p className="crumb">
          <Link href="/gallery">Gallery</Link>
        </p>
        <h1>{rec.title}</h1>
        <p className="byline">
          {rec.author ? `By ${rec.author}` : "By an anonymous crew"}, published {formatDate(rec.createdAt)}
        </p>
        {rec.notes && <p className="designer-notes">{rec.notes}</p>}
      </div>

      <ScenarioBody
        id={rec.id}
        title={rec.title}
        layout={rec.layout}
        analysis={analyze(rec.layout)}
        editorHref={`/?${layoutToSearchParams(rec.layout, remixTitle).toString()}`}
      />
    </article>
  );
}
