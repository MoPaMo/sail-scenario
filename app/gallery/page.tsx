import type { Metadata } from "next";
import Link from "next/link";
import BoardSvg from "@/components/BoardSvg";
import TokenIcon from "@/components/TokenIcon";
import { difficultyLevel } from "@/lib/difficultyScale";
import { formatDate } from "@/lib/format";
import { OFFICIAL_SCENARIOS } from "@/lib/official";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gallery",
  description: "Custom Sail scenarios published by players, plus the six from the box to remix.",
  openGraph: {
    type: "website",
    siteName: "Sail Scenario Workshop",
    title: "Gallery – Sail Scenario Workshop",
    description: "Custom Sail scenarios published by players, plus the six from the box to remix.",
    url: "/gallery",
    images: [{ url: "/og", width: 1200, height: 630, alt: "A Sail ocean board with islands, krakens and storms" }],
  },
};

const PAGE_SIZE = 24;

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const store = getStore();
  const { items, total } = await store.list((page - 1) * PAGE_SIZE, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="gallery">
      <div className="page-head">
        <h1>Gallery</h1>
        <p>
          {total > 0
            ? `${total} scenario${total === 1 ? "" : "s"} published by players, newest first.`
            : "Scenarios published by players show up here, newest first."}
        </p>
      </div>

      {store.kind === "memory" && (
        <p className="notice notice--dark">
          No database is connected, so this list empties whenever the server restarts. The README explains how to add Upstash Redis on Vercel.
        </p>
      )}

      {items.length > 0 ? (
        <ul className="cards">
          {items.map((s) => (
            <li key={s.id}>
              <Link href={`/s/${s.id}`} className="card">
                <BoardSvg layout={s.layout} orientation="horizontal" compact label={`Map of ${s.title}`} />
                <div className="card-body">
                  <h2 className="card-title">{s.title}</h2>
                  <p className="card-meta">
                    {s.author ? `by ${s.author}` : "by an anonymous crew"}, {formatDate(s.createdAt)}
                  </p>
                  <ul className="card-stats">
                    <li>
                      <TokenIcon kind="island" size={20} />
                      {s.layout.islands.length}
                      <span className="sr-only"> islands</span>
                    </li>
                    <li>
                      <TokenIcon kind="kraken" size={20} />
                      {s.layout.kraken.length}
                      <span className="sr-only"> krakens</span>
                    </li>
                    <li>
                      <TokenIcon kind="storm" size={20} />
                      {s.layout.storms.length}
                      <span className="sr-only"> storms</span>
                    </li>
                    <li className="card-length">{s.stats.columns} columns</li>
                    {typeof s.stats.winRate === "number" && (
                      <li className="card-level">
                        <span className={`level level--${difficultyLevel(s.stats.winRate).level}`}>{difficultyLevel(s.stats.winRate).label}</span>
                      </li>
                    )}
                  </ul>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : page > 1 ? (
        <div className="empty">
          <p>There&apos;s nothing on this page.</p>
          <Link className="btn" href="/gallery">
            Back to the newest scenarios
          </Link>
        </div>
      ) : (
        <div className="empty">
          <p>Nothing has been published yet.</p>
          <Link className="btn btn--primary" href="/">
            Design the first scenario
          </Link>
        </div>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="Gallery pages">
          {page > 1 ? (
            <Link className="btn" href={`/gallery?page=${page - 1}`}>
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="btn" href={`/gallery?page=${page + 1}`}>
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <section className="book" aria-labelledby="book-heading">
        <h2 id="book-heading">From the scenario book</h2>
        <p>The six layouts printed in the box. Open one in the editor to use it as a starting point.</p>
        <ul className="cards cards--book">
          {OFFICIAL_SCENARIOS.map((s) => (
            <li key={s.slug}>
              <Link href={`/?preset=${s.slug}`} className="card card--book">
                <BoardSvg layout={s.layout} orientation="horizontal" compact label={`Map of ${s.name}`} />
                <div className="card-body">
                  <h3 className="card-title">{s.name}</h3>
                  <p className="card-meta">Open in the editor</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
