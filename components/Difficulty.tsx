import { DIFFICULTY_GAMES } from "@/lib/difficulty";
import { compareWithBook, difficultyLevel, OFFICIAL_WIN_RATES, percent } from "@/lib/difficultyScale";
import type { DifficultyState } from "./useDifficulty";

/**
 * Simulated difficulty: a level, how it compares with the printed scenarios
 * (a ladder from easiest to hardest with this scenario slotted in), and why
 * simulated crews lost.
 */
export default function Difficulty({ state, showLosses = true }: { state: DifficultyState; showLosses?: boolean }) {
  const r = state.result;
  if (!r) {
    return (
      <div className="difficulty difficulty--pending" aria-live="polite">
        <p className="difficulty-note">{state.running ? "Playing simulated games…" : "Difficulty appears once the course is valid."}</p>
      </div>
    );
  }
  const { level, label } = difficultyLevel(r.winRate);
  const compare = compareWithBook(r.winRate);
  const ladder = [...OFFICIAL_WIN_RATES.map((o) => ({ key: o.slug, short: o.short, rate: o.winRate, title: o.name, me: false })), { key: "me", short: "This", rate: r.winRate, title: "this scenario", me: true }].sort(
    (a, b) => b.rate - a.rate || (a.me ? 1 : -1),
  );
  const lost = r.games - r.wins;
  const reasons = [
    { n: r.losses.storm, text: "missed a storm deadline" },
    { n: r.losses.kraken, text: "were sunk by the Kraken" },
    { n: r.losses.time, text: "ran out of rounds" },
  ].filter((x) => x.n > 0);

  return (
    <div className={`difficulty${state.running ? " difficulty--running" : ""}`} aria-live="polite">
      <div className="difficulty-head">
        <span className={`level level--${level}`}>{label}</span>
        <span className="difficulty-compare">{compare}.</span>
      </div>
      <ol className="ladder" aria-label="Simulated win rate compared with the printed scenarios, easiest first">
        {ladder.map((x) => (
          <li key={x.key} className={x.me ? "is-this" : undefined} title={`${x.title}: ${percent(x.rate)} won`}>
            <span className="ladder-name">{x.me ? "This" : x.short === "L" ? "Learning" : `S${x.short}`}</span>
            <span className="ladder-rate">{percent(x.rate)}</span>
          </li>
        ))}
      </ol>
      <p className="difficulty-note">
        {state.running
          ? `${r.wins} of ${r.games} simulated games won so far (of ${DIFFICULTY_GAMES})…`
          : `${r.wins} of ${r.games} simulated games won.`}
        {showLosses && lost > 0 && reasons.length > 0 && (
          <>
            {" "}
            Of the lost games, {reasons.map((x, i) => `${i ? (i === reasons.length - 1 ? " and " : ", ") : ""}${percent(x.n / lost)} ${x.text}`).join("")}.
          </>
        )}
      </p>
    </div>
  );
}
