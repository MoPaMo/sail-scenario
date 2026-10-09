import type { ReactNode } from "react";
import { legendRows, stormText, type Layout } from "@/lib/scenario";
import TokenIcon from "./TokenIcon";

/**
 * The scenario written out the way the printed scenario book does it:
 * token lists on the left, storms on the right, the name in the corner.
 */
export default function LegendCard({
  layout,
  title,
  titleSlot,
}: {
  layout: Layout;
  title?: string;
  /** Replaces the static title, e.g. with an input in the editor. */
  titleSlot?: ReactNode;
}) {
  const rows = legendRows(layout);
  const singleStorm = layout.storms.length === 1;
  return (
    <section className="legend" aria-label="Scenario card">
      <dl className="legend-rows">
        {rows.map((row) => (
          <div className="legend-row" key={row.kind}>
            <dt>
              <TokenIcon kind={row.kind} size={34} />
              <span>{row.heading}</span>
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="legend-side">
        <dl className="legend-storm">
          <div className="legend-row">
            <dt>
              <TokenIcon kind="storm" size={34} />
              <span>Storm</span>
            </dt>
            <dd>
              <span aria-hidden="true">↕ </span>
              {stormText(layout)}
            </dd>
          </div>
        </dl>
        {singleStorm && <p className="legend-note">With one storm, the ship must be past it before round 3 begins.</p>}
        <div className="legend-title">{titleSlot ?? <p className="legend-title-text">{title || "Untitled scenario"}</p>}</div>
      </div>
    </section>
  );
}
