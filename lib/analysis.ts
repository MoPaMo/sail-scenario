import { ALL_CELLS, cellId, columnOf, endTokenCellIds, forwardMoves, parseCell, type CellPos } from "./board";
import { OFFICIAL_SCENARIOS } from "./official";
import { occupancy, type Layout } from "./scenario";

export type Severity = "error" | "warning" | "ok" | "info";

export interface Check {
  severity: Severity;
  text: string;
}

export interface Route {
  cells: string[]; // includes the start
  moves: number;
  krakenHits: number;
}

export interface StormCheck {
  column: number;
  deadlineRound: number;
  maxTricks: number;
  movesToPass: number | null;
}

export interface Analysis {
  checks: Check[];
  errors: string[];
  canPublish: boolean;
  reachable: boolean;
  columns: number | null;
  fastest: Route | null;
  safest: Route | null;
  storms: StormCheck[];
  /** Spaces the ship can reach but from which the End can no longer be reached. */
  traps: string[];
  comparable: string | null;
}

/** A round ends when one player wins their 4th trick, so it lasts 4–7 tricks. */
export const MAX_TRICKS_PER_ROUND = 7;
export const ROUNDS = 5;

interface Graph {
  blocked: Set<string>;
  kraken: Set<string>;
  goal: Set<string>;
}

function buildGraph(l: Layout): Graph {
  return {
    blocked: new Set(l.islands),
    kraken: new Set(l.kraken),
    goal: new Set(l.end ? endTokenCellIds(l.end) : []),
  };
}

function nextCells(g: Graph, p: CellPos): CellPos[] {
  return forwardMoves(p)
    .map((m) => m.to)
    .filter((to) => !g.blocked.has(cellId(to.r, to.c)));
}

/**
 * Lexicographic shortest path from the start to any End space.
 * `primary` decides whether we minimise moves first or kraken hits first.
 * The ship stops as soon as it touches an End space, so goal spaces are terminal.
 */
function bestRoute(l: Layout, g: Graph, primary: "moves" | "kraken"): Route | null {
  if (!l.start) return null;
  const start = l.start;
  const cost = new Map<string, [number, number]>([[start, [0, 0]]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  const key = (c: [number, number]) => (primary === "moves" ? c[0] * 1000 + c[1] : c[1] * 1000 + c[0]);

  for (;;) {
    let current: string | null = null;
    for (const [id, c] of cost) {
      if (done.has(id)) continue;
      if (current === null || key(c) < key(cost.get(current)!)) current = id;
    }
    if (current === null) return null;
    if (g.goal.has(current)) {
      const cells = [current];
      while (prev.has(cells[0])) cells.unshift(prev.get(cells[0])!);
      const [moves, krakenHits] = cost.get(current)!;
      return { cells, moves, krakenHits };
    }
    done.add(current);
    const [m, k] = cost.get(current)!;
    for (const to of nextCells(g, parseCell(current)!)) {
      const id = cellId(to.r, to.c);
      if (done.has(id)) continue;
      const cand: [number, number] = [m + 1, k + (g.kraken.has(id) ? 1 : 0)];
      const old = cost.get(id);
      if (!old || key(cand) < key(old)) {
        cost.set(id, cand);
        prev.set(id, current);
      }
    }
  }
}

/** Fewest moves from the start to every reachable space (stopping at the End). */
function moveDistances(l: Layout, g: Graph): Map<string, number> {
  const dist = new Map<string, number>();
  if (!l.start) return dist;
  dist.set(l.start, 0);
  const queue = [l.start];
  while (queue.length) {
    const id = queue.shift()!;
    if (g.goal.has(id)) continue;
    for (const to of nextCells(g, parseCell(id)!)) {
      const t = cellId(to.r, to.c);
      if (!dist.has(t)) {
        dist.set(t, dist.get(id)! + 1);
        queue.push(t);
      }
    }
  }
  return dist;
}

/** Spaces from which some sequence of moves still reaches the End. */
function canReachEnd(g: Graph): Set<string> {
  const ok = new Set<string>(g.goal);
  // Moves only go to higher columns, so a right-to-left sweep is enough.
  const cells = [...ALL_CELLS].sort((a, b) => b.c - a.c);
  for (const p of cells) {
    const id = cellId(p.r, p.c);
    if (ok.has(id) || g.blocked.has(id)) continue;
    if (nextCells(g, p).some((to) => ok.has(cellId(to.r, to.c)))) ok.add(id);
  }
  return ok;
}

function officialColumns(): { name: string; columns: number }[] {
  return OFFICIAL_SCENARIOS.map((s) => ({
    name: s.name,
    columns: columnOf(s.layout.end!) - columnOf(s.layout.start!),
  }));
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

  const g = buildGraph(l);
  const occ = occupancy(l);
  const startCol = l.start ? columnOf(l.start) : null;
  const tipCol = l.end ? columnOf(l.end) : null;

  if (!l.start) error("Place the Start token.");
  if (!l.end) error("Place the End token.");

  let fastest: Route | null = null;
  let safest: Route | null = null;
  let columns: number | null = null;
  let traps: string[] = [];
  const storms: StormCheck[] = [];
  let comparable: string | null = null;

  if (l.start && l.end && startCol !== null && tipCol !== null) {
    columns = tipCol - startCol;
    if (columns <= 1) {
      error("The End must be ahead of the Start: the ship only ever sails forward (left to right).");
    } else {
      fastest = bestRoute(l, g, "moves");
      safest = bestRoute(l, g, "kraken");
      if (!fastest || !safest) {
        error("The End can't be reached from the Start. Islands block every forward route.");
      } else {
        ok(`The End is reachable. The fastest route takes ${fastest.moves} moves.`);
        if (safest.krakenHits === 0) {
          ok(
            fastest.krakenHits === 0
              ? "A route exists that avoids every kraken space."
              : `The safest route avoids every kraken space but takes ${safest.moves} moves (the fastest passes ${fastest.krakenHits}).`,
          );
        } else {
          info(`Every route crosses at least ${safest.krakenHits} kraken space${safest.krakenHits > 1 ? "s" : ""}.`);
        }
        const maxTricks = ROUNDS * MAX_TRICKS_PER_ROUND;
        if (fastest.moves > maxTricks) {
          warn(
            `The fastest route needs ${fastest.moves} moves, but a game lasts at most ${maxTricks} tricks. Only lucky cannon flips could finish it.`,
          );
        }
      }

      const official = officialColumns();
      const closest = official.reduce((a, b) => (Math.abs(b.columns - columns!) < Math.abs(a.columns - columns!) ? b : a));
      comparable = closest.columns === columns ? `the same length as ${closest.name}` : `closest in length to ${closest.name} (${closest.columns})`;
    }
  }

  // Storms
  const dist = moveDistances(l, g);
  l.storms.forEach((col, i) => {
    const deadlineRound = l.storms.length === 1 || i === 0 ? 2 : 4;
    const maxTricks = deadlineRound * MAX_TRICKS_PER_ROUND;
    let movesToPass: number | null = null;
    for (const [id, d] of dist) {
      if (columnOf(id) > col && (movesToPass === null || d < movesToPass)) movesToPass = d;
    }
    storms.push({ column: col, deadlineRound, maxTricks, movesToPass });
    const label = l.storms.length === 1 ? "The storm" : i === 0 ? "The first storm" : "The second storm";
    if (startCol !== null && col < startCol) {
      error(`${label} at column ${col} is behind the Start, so it would already be passed.`);
    } else if (tipCol !== null && col >= tipCol - 1) {
      error(`${label} at column ${col} sits on or past the End. Move it before column ${tipCol - 1}.`);
    } else if (l.start && movesToPass === null) {
      error(`${label} at column ${col} can't be passed: no route gets the ship beyond it.`);
    } else if (movesToPass !== null && movesToPass > maxTricks) {
      warn(
        `${label} at column ${col} needs ${movesToPass} moves to pass, but only ${maxTricks} tricks can happen by the end of round ${deadlineRound}.`,
      );
    } else if (movesToPass !== null) {
      ok(`${label} at column ${col} can be passed in ${movesToPass} moves (deadline: end of round ${deadlineRound}).`);
    }
  });
  if (l.storms.length === 0 && l.start && l.end) {
    info("No storms. Only the 5-round limit and the Kraken put the crew under time pressure.");
  }

  // Traps: reachable spaces left of the finish line from which the End is lost for good.
  if (l.start && l.end && tipCol !== null && fastest) {
    const good = canReachEnd(g);
    traps = [...dist.keys()].filter((id) => !good.has(id) && columnOf(id) < tipCol - 1 && occ.get(id) !== "end");
    if (traps.length) {
      warn(
        `${traps.length} space${traps.length > 1 ? "s are" : " is a"} dead end${traps.length > 1 ? "s" : ""} (${traps.join(", ")}): once the ship is there, the End can't be reached.`,
      );
    }
  }

  const copy = officialCopy(l);
  if (copy) error(`This is ${copy} exactly as printed. Change at least one token to publish it as your own.`);

  if (l.start && startCol !== null && startCol > 3) {
    info(`The Start is on column ${startCol}. Every printed scenario starts on D1.`);
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2, ok: 3 };
  checks.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    checks,
    errors,
    canPublish: errors.length === 0,
    reachable: !!fastest,
    columns,
    fastest,
    safest,
    storms,
    traps,
    comparable,
  };
}
