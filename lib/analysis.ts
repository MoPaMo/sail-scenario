import { columnOf } from "./board";
import { boardFromLayout, CELL_ID, COL, DIR_AHEAD, DIR_BOTTOM, DIR_TOP, step, type Board } from "./game/geometry";
import { earliest, type IdealOptions, type IdealPlan } from "./game/ideal";
import { OFFICIAL_SCENARIOS } from "./official";
import { occupancy, type Layout } from "./scenario";

export type Severity = "error" | "warning" | "ok" | "info";

export interface Check {
  severity: Severity;
  text: string;
}

/** A best-case plan, with cell ids for display. */
export interface Plan {
  round: number;
  trick: number;
  tricks: number;
  moves: number;
  krakenHits: number;
  cells: string[];
  /** Round of each move (cells[i + 1] is reached in moveRounds[i]). */
  moveRounds: number[];
}

export interface StormCheck {
  column: number;
  deadlineRound: number;
  /** Earliest passing with ideal cards, without pirates / with pirate 4. */
  best: Plan | null;
  bestExtra: Plan | null;
}

export interface Analysis {
  checks: Check[];
  errors: string[];
  canPublish: boolean;
  /** The End can be reached at all (ignoring time). */
  reachable: boolean;
  columns: number | null;
  /** Earliest finish with ideal cards: without pirate powers, and with pirate 4's extra trick. */
  best: Plan | null;
  bestExtra: Plan | null;
  storms: StormCheck[];
  /** Route to draw: the best-case plan. */
  route: Plan | null;
  /** Spaces the ship can reach but from which the End can no longer be reached. */
  traps: string[];
}

/** The model behind "best case", for the explanation under the course check. */
export const BEST_CASE_RULES =
  "Best case: every trick moves the ship, helm moves go towards whoever wins the trick, a round ends at someone's 4th win (4–7 tricks), and at most one fish-tail move per round, since that takes two of the three 9s.";

const IDEAL: IdealOptions = {};
const IDEAL_EXTRA: IdealOptions = { extraTrick: true };
/** Absolute limit: a move on every trick, any direction, straight whenever wanted, 8 tricks a round. */
const ANYTHING: IdealOptions = { extraTrick: true, freeDirection: true, straightPerRound: 8 };

const toPlan = (p: IdealPlan | null): Plan | null =>
  p && { round: p.round, trick: p.trick, tricks: p.tricks, moves: p.moves, krakenHits: p.krakenHits, cells: p.cells.map((c) => CELL_ID[c]), moveRounds: p.moveRounds };

const when = (p: Plan) => (p.trick > 0 ? `trick ${p.trick} of round ${p.round}` : `round ${p.round}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Spaces reachable at all, ignoring time, with any move. */
function reachableCells(b: Board): Set<number> {
  const seen = new Set<number>([b.start]);
  const queue = [b.start];
  while (queue.length) {
    const c = queue.shift()!;
    if (b.goal[c]) continue;
    for (const dir of [DIR_TOP, DIR_BOTTOM, DIR_AHEAD]) {
      const t = step(b, c, dir);
      if (t >= 0 && !seen.has(t)) {
        seen.add(t);
        queue.push(t);
      }
    }
  }
  return seen;
}

/** Spaces from which some sequence of moves still reaches the End. */
function canReachEnd(b: Board): Set<number> {
  const ok = new Set<number>();
  const order = [...COL.keys()].sort((x, y) => COL[y] - COL[x]);
  for (const c of order) {
    if (b.island[c]) continue;
    if (b.goal[c] || [DIR_TOP, DIR_BOTTOM, DIR_AHEAD].some((d) => ok.has(step(b, c, d)))) ok.add(c);
  }
  return ok;
}

function signature(l: Layout): string {
  const s = (a: string[]) => [...a].sort().join(",");
  return [l.start, l.end, s(l.islands), s(l.kraken), l.storms.join(","), s(l.whirlpools), s(l.allies), s(l.crowsNests)].join("|");
}

/** Name of the printed scenario this layout duplicates, if any. */
export function officialCopy(l: Layout): string | null {
  const sig = signature(l);
  return OFFICIAL_SCENARIOS.find((s) => signature(s.layout) === sig)?.name ?? null;
}

export function analyze(l: Layout): Analysis {
  const checks: Check[] = [];
  const errors: string[] = [];
  const error = (text: string) => {
    errors.push(text);
    checks.push({ severity: "error", text });
  };
  const warn = (text: string) => checks.push({ severity: "warning", text });
  const ok = (text: string) => checks.push({ severity: "ok", text });
  const info = (text: string) => checks.push({ severity: "info", text });

  const result: Analysis = {
    checks,
    errors,
    canPublish: false,
    reachable: false,
    columns: null,
    best: null,
    bestExtra: null,
    storms: [],
    route: null,
    traps: [],
  };

  if (!l.start) error("Place the Start token.");
  if (!l.end) error("Place the End token.");
  const startCol = l.start ? columnOf(l.start) : null;
  const tipCol = l.end ? columnOf(l.end) : null;
  const b = boardFromLayout(l);

  // Storm placement problems are independent of the route.
  const stormName = (i: number) => (l.storms.length === 1 ? "The storm" : i === 0 ? "The first storm" : "The second storm");
  const sortedStorms = [...l.storms].sort((x, y) => x - y);
  let stormsPlaced = true;
  sortedStorms.forEach((col, i) => {
    if (startCol !== null && col < startCol) {
      error(`${stormName(i)} at column ${col} is behind the Start, so it would already be passed.`);
      stormsPlaced = false;
    } else if (tipCol !== null && col >= tipCol - 1) {
      error(`${stormName(i)} at column ${col} sits on or past the End. Move it before column ${tipCol - 1}.`);
      stormsPlaced = false;
    }
  });

  if (b && startCol !== null && tipCol !== null) {
    result.columns = tipCol - startCol;
    if (result.columns <= 1) {
      error("The End must be ahead of the Start: the ship only ever sails forward (left to right).");
    } else {
      const reach = reachableCells(b);
      result.reachable = [...reach].some((c) => b.goal[c]);
      if (!result.reachable) {
        error("The End can't be reached from the Start. Islands block every forward route.");
      } else if (stormsPlaced) {
        analyseTiming(l, b, result, { error, warn, ok, info }, stormName);
        const good = canReachEnd(b);
        result.traps = [...reach]
          .filter((c) => !good.has(c) && !b.goal[c] && COL[c] < tipCol - 1)
          .map((c) => CELL_ID[c])
          .sort((x, y) => columnOf(x) - columnOf(y) || x.localeCompare(y));
        if (result.traps.length) {
          const n = result.traps.length;
          warn(
            `${n === 1 ? "1 space is a dead end" : `${n} spaces are dead ends`} (${result.traps.join(", ")}): once the ship is there, the End can't be reached.`,
          );
        }
      }
    }
  }

  const copy = officialCopy(l);
  if (copy) error(`This is ${copy} exactly as printed. Change at least one token to publish it as your own.`);
  if (startCol !== null && startCol > 3) info(`The Start is on column ${startCol}. Every printed scenario starts on D1.`);
  if (l.storms.length === 0 && l.start && l.end) {
    info("No storms. Only the 5-round limit and the Kraken put the crew under time pressure.");
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2, ok: 3 };
  checks.sort((x, y) => order[x.severity] - order[y.severity]);
  result.canPublish = errors.length === 0;
  return result;
}

type Report = Record<"error" | "warn" | "ok" | "info", (text: string) => void>;

function analyseTiming(l: Layout, b: Board, result: Analysis, report: Report, stormName: (i: number) => string) {
  const isEnd = (c: number) => b.goal[c] === 1;

  // Storms first: each must be passed by its deadline (the earlier one's deadline also applies).
  let stormsFeasible = true;
  let stormNeedsLuck = false;
  b.storms.forEach((col, i) => {
    const past = (c: number) => COL[c] > col;
    const deadline = b.deadlines[i];
    const check: StormCheck = {
      column: col,
      deadlineRound: deadline,
      best: toPlan(earliest(b, past, IDEAL)),
      bestExtra: toPlan(earliest(b, past, IDEAL_EXTRA)),
    };
    result.storms.push(check);
    const label = `${stormName(i)} at column ${col}`;
    if (check.best) {
      report.ok(`${label} can be passed by ${when(check.best)} at the earliest (deadline: end of round ${deadline}).`);
    } else if (check.bestExtra) {
      stormNeedsLuck = true;
      report.warn(`${label} can only be passed by the end of round ${deadline} with pirate 4's extra trick and ideal cards.`);
    } else if (earliest(b, past, ANYTHING)) {
      stormNeedsLuck = true;
      report.warn(`${label} can't be passed by the end of round ${deadline} even with ideal cards: only lucky cannon flips or straight-moving pirates could do it.`);
    } else {
      stormsFeasible = false;
      report.error(`${label} can't be passed by the end of round ${deadline}, even if every trick moved the ship two columns. Move it further right, or the islands out of the way.`);
    }
  });
  if (!stormsFeasible) return;

  result.best = toPlan(earliest(b, isEnd, IDEAL));
  result.bestExtra = toPlan(earliest(b, isEnd, IDEAL_EXTRA));
  result.route = result.best ?? result.bestExtra;
  if (result.best) {
    const p = result.best;
    report.ok(`With ideal cards the End can be reached by ${when(p)} at the earliest: ${plural(p.tricks, "trick")}, ${plural(p.moves, "move")}.`);
  } else if (stormNeedsLuck) {
    // The storm warning above already explains why the End can't be reached in time.
  } else if (result.bestExtra) {
    report.warn("The End can only be reached in time with pirate 4's extra trick and ideal cards.");
  } else if (earliest(b, isEnd, ANYTHING)) {
    report.warn("Even ideal cards can't reach the End in 5 rounds: only lucky cannon flips or straight-moving pirates could finish it.");
  } else {
    report.error("The End can't be reached within 5 rounds, even if every trick moved the ship two columns.");
    return;
  }
  const route = result.route;
  if (route && route.krakenHits > 0) {
    report.info(`The best route crosses ${plural(route.krakenHits, "kraken space")}; each one damages the ship.`);
  }
  void l;
}
