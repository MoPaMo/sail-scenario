import { BEST_CASE_RULES, type Analysis, type Severity } from "@/lib/analysis";
import { percent } from "@/lib/difficultyScale";
import Difficulty from "./Difficulty";
import type { DifficultyState } from "./useDifficulty";

const ICON: Record<Severity, { glyph: string; label: string }> = {
  error: { glyph: "✕", label: "Must fix" },
  warning: { glyph: "!", label: "Warning" },
  info: { glyph: "i", label: "Note" },
  ok: { glyph: "✓", label: "OK" },
};

/** Route stats, difficulty and checks, without a frame (the editor panel and the scenario page's tips use it). */
export function CourseDetails({
  analysis,
  difficulty,
  showDifficulty = true,
}: {
  analysis: Analysis;
  difficulty?: DifficultyState;
  /** The scenario page shows the difficulty outside the tips, with losses here. */
  showDifficulty?: boolean;
}) {
  const best = analysis.best ?? analysis.bestExtra;
  const r = difficulty?.result;
  return (
    <>
      <dl className="course-stats">
        <div>
          <dt>Length</dt>
          <dd>{analysis.columns !== null && analysis.columns > 0 ? `${analysis.columns} columns` : "—"}</dd>
        </div>
        <div>
          <dt>Best case</dt>
          <dd>
            {best ? `Round ${best.round}` : "—"}
            {best && !analysis.best && <small> with pirate 4</small>}
          </dd>
        </div>
        <div>
          <dt>Simulated wins</dt>
          <dd>{r ? `${percent(r.winRate)}${difficulty?.running ? "…" : ""}` : difficulty?.running ? "…" : "—"}</dd>
        </div>
      </dl>
      {difficulty && showDifficulty && <Difficulty state={difficulty} />}
      {difficulty?.result && !showDifficulty && <LossLine state={difficulty} />}
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
      <details className="course-method">
        <summary>How this is worked out</summary>
        <p>{BEST_CASE_RULES}</p>
        <p>
          The difficulty comes from 400 simulated games with the real cards: dealing, passing, following the led colour, symbol pairs,
          cannon flips, Kraken damage and storm deadlines, without pirate powers. The simulated crew doesn&apos;t talk either: whoever
          leads only knows their own hand. Real crews read each other better or worse, so compare with the printed scenarios rather
          than trusting the exact percentage.
        </p>
        <p>The numbers on the route mark where each round ends in the best case. Hatched spaces are dead ends.</p>
      </details>
    </>
  );
}

/** Why simulated crews lost, for the scenario page's tips. */
function LossLine({ state }: { state: DifficultyState }) {
  const r = state.result!;
  const lost = r.games - r.wins;
  if (!lost) return <p className="course-compare">Every simulated crew made it.</p>;
  const parts = [
    { n: r.losses.storm, text: "missed a storm deadline" },
    { n: r.losses.kraken, text: "were sunk by the Kraken" },
    { n: r.losses.time, text: "ran out of rounds" },
  ].filter((x) => x.n);
  return (
    <p className="course-compare">
      Of the simulated crews that lost, {parts.map((x, i) => `${i ? (i === parts.length - 1 ? " and " : ", ") : ""}${percent(x.n / lost)} ${x.text}`).join("")}.
    </p>
  );
}

export default function CourseCheck({ analysis, difficulty }: { analysis: Analysis; difficulty?: DifficultyState }) {
  return (
    <section className="course" aria-labelledby="course-heading">
      <h2 id="course-heading">Course check</h2>
      <CourseDetails analysis={analysis} difficulty={difficulty} />
    </section>
  );
}
