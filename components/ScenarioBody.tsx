"use client";

import Link from "next/link";
import { useState } from "react";
import type { Analysis } from "@/lib/analysis";
import type { Layout } from "@/lib/scenario";
import BoardViewer from "./BoardViewer";
import { CourseDetails } from "./CourseCheck";
import Difficulty from "./Difficulty";
import { useDifficulty } from "./useDifficulty";
import LegendCard from "./LegendCard";
import { CopyLinkButton, PrintButton } from "./ShareButtons";

/**
 * A published scenario as players see it: the map and the scenario card, with
 * everything that gives the solution away (best route, dead ends, move counts)
 * kept behind a Tips panel the player has to open.
 */
export default function ScenarioBody({
  id,
  title,
  layout,
  analysis,
  editorHref,
}: {
  id: string;
  title: string;
  layout: Layout;
  analysis: Analysis;
  editorHref: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const traps = analysis.traps;
  const difficulty = useDifficulty(layout, analysis.reachable, 0);

  return (
    <>
      <BoardViewer
        id="map"
        layout={layout}
        route={revealed ? (analysis.route?.cells ?? null) : null}
        routeRounds={revealed ? (analysis.route?.moveRounds ?? null) : null}
        traps={revealed ? traps : []}
        label={revealed ? `Map of ${title}, with the best route drawn in` : `Map of ${title}`}
      />

      <div className="detail-actions">
        <Link className="btn btn--primary" href={editorHref}>
          Remix in the editor
        </Link>
        <PrintButton />
        <CopyLinkButton path={`/s/${id}`} />
      </div>
      <p className="owner-hint">Made this one? Open the private edit link from your email to change or delete it.</p>

      <div className="sheet">
        <LegendCard layout={layout} title={title} />
        <div className="side">
        <section className="difficulty-panel" aria-labelledby="difficulty-heading">
          <h2 id="difficulty-heading">Difficulty</h2>
          <Difficulty state={difficulty} showLosses={false} />
        </section>
        <section className={`tips${revealed ? " tips--open" : ""}`} aria-labelledby="tips-heading">
          <div className="tips-head">
            <h2 id="tips-heading">Tips</h2>
            <button
              type="button"
              className={revealed ? "btn" : "btn btn--primary"}
              aria-expanded={revealed}
              aria-controls="tips-content"
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? "Hide tips" : "Show tips"}
            </button>
          </div>
          {!revealed && (
            <p className="tips-cover">
              Contains spoilers: the best route on the map with where each round ends, dead-end spaces, and why simulated crews lost. Try the scenario first.
            </p>
          )}
          <div id="tips-content" hidden={!revealed}>
            {revealed && (
              <>
                <p className="tips-note">
                  The best route is now drawn on the map
                  {traps.length > 0 ? ", and dead-end spaces are hatched" : ""}. <a href="#map">Back to the map</a>
                </p>
                <CourseDetails analysis={analysis} difficulty={difficulty} showDifficulty={false} />
              </>
            )}
          </div>
        </section>
        </div>
      </div>
    </>
  );
}
