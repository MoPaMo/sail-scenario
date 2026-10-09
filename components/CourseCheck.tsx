import type { Analysis, Severity } from "@/lib/analysis";

const ICON: Record<Severity, { glyph: string; label: string }> = {
  error: { glyph: "✕", label: "Must fix" },
  warning: { glyph: "!", label: "Warning" },
  info: { glyph: "i", label: "Note" },
  ok: { glyph: "✓", label: "OK" },
};

export default function CourseCheck({ analysis, children }: { analysis: Analysis; children?: React.ReactNode }) {
  const { fastest, safest, columns } = analysis;
  return (
    <section className="course" aria-labelledby="course-heading">
      <h2 id="course-heading">Course check</h2>
      <dl className="course-stats">
        <div>
          <dt>Length</dt>
          <dd>{columns !== null && columns > 0 ? `${columns} columns` : "—"}</dd>
        </div>
        <div>
          <dt>Shortest route</dt>
          <dd>{fastest ? `${fastest.moves} moves` : "—"}</dd>
        </div>
        <div>
          <dt>Unavoidable kraken spaces</dt>
          <dd>{safest ? safest.krakenHits : "—"}</dd>
        </div>
      </dl>
      {analysis.comparable && <p className="course-compare">Course is {analysis.comparable}.</p>}
      <ul className="checks">
        {analysis.checks.map((c, i) => (
          <li key={i} className={`check check--${c.severity}`}>
            <span className="check-icon" role="img" aria-label={ICON[c.severity].label}>
              {ICON[c.severity].glyph}
            </span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      <p className="course-footnote">
        The shortest route counts a fish-tail move (straight ahead, two columns) as one move. Hatched spaces on the map are dead ends.
      </p>
      {children}
    </section>
  );
}
