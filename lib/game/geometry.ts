import { ALL_CELLS, cellId, endTokenCellIds, isOnBoard, MAX_COL } from "../board";
import type { Layout } from "../scenario";

/**
 * Index-based board for the search and the simulation. Cells are numbered
 * 0…78 in ALL_CELLS order; moves are lookup tables.
 *
 * Seats: player 0 sits on the row A side ("top"), player 1 on the row G side.
 * A helm move goes forward (one column) and towards the trick winner's side;
 * a straight move goes forward two columns in the same row.
 */

export const CELLS = ALL_CELLS.length;
export const CELL_ID = ALL_CELLS.map((p) => cellId(p.r, p.c));
export const COL = Int8Array.from(ALL_CELLS.map((p) => p.c));
const INDEX = new Map(CELL_ID.map((id, i) => [id, i]));

const at = (r: number, c: number) => (isOnBoard(r, c) ? INDEX.get(cellId(r, c))! : -1);

export const DIR_TOP = 0;
export const DIR_BOTTOM = 1;
export const DIR_AHEAD = 2;

/** NEXT[dir][cell] = target cell, or -1 off the board. */
export const NEXT: Int16Array[] = [
  Int16Array.from(ALL_CELLS.map((p) => at(p.r - 1, p.c + 1))),
  Int16Array.from(ALL_CELLS.map((p) => at(p.r + 1, p.c + 1))),
  Int16Array.from(ALL_CELLS.map((p) => at(p.r, p.c + 2))),
];

export const cellIndex = (id: string) => INDEX.get(id) ?? -1;

export interface Board {
  start: number;
  island: Uint8Array;
  kraken: Uint8Array;
  goal: Uint8Array;
  /** Storm columns, ascending; storms[i] must be passed by the end of round deadline[i]. */
  storms: number[];
  deadlines: number[];
}

export function boardFromLayout(l: Layout): Board | null {
  if (!l.start || !l.end) return null;
  const start = cellIndex(l.start);
  const goalIds = endTokenCellIds(l.end);
  if (start < 0 || goalIds.length !== 3) return null;
  const mark = (ids: string[]) => {
    const a = new Uint8Array(CELLS);
    for (const id of ids) {
      const i = cellIndex(id);
      if (i >= 0) a[i] = 1;
    }
    return a;
  };
  const storms = [...l.storms].sort((a, b) => a - b);
  return {
    start,
    island: mark(l.islands),
    kraken: mark(l.kraken),
    goal: mark(goalIds),
    storms,
    deadlines: storms.length === 1 ? [2] : storms.map((_, i) => (i === 0 ? 2 : 4)),
  };
}

/** Where a move ends, or -1 if it is blocked (off the board or onto an island). */
export function step(b: Board, cell: number, dir: number): number {
  const t = NEXT[dir][cell];
  return t >= 0 && !b.island[t] ? t : -1;
}

/** Is the ship completely past the storm on `column`? */
export const pastStorm = (cell: number, column: number) => COL[cell] > column;

/**
 * Cost-to-go towards a set of target cells, moving forward only.
 * diagonal moves cost 1, straight moves `straightCost`, entering a kraken space adds `krakenCost`.
 */
export function distanceTo(b: Board, isTarget: (cell: number) => boolean, straightCost: number, krakenCost: number): Float64Array {
  const d = new Float64Array(CELLS).fill(Infinity);
  // Moves only increase the column, so one right-to-left sweep is exact.
  const order = [...Array(CELLS).keys()].sort((x, y) => COL[y] - COL[x]);
  for (const cell of order) {
    if (b.island[cell]) continue;
    if (isTarget(cell)) {
      d[cell] = 0;
      continue;
    }
    let best = Infinity;
    for (let dir = 0; dir < 3; dir++) {
      const t = step(b, cell, dir);
      if (t < 0 || d[t] === Infinity) continue;
      const cost = (dir === DIR_AHEAD ? straightCost : 1) + (b.kraken[t] && !isTarget(t) ? krakenCost : 0);
      if (cost + d[t] < best) best = cost + d[t];
    }
    d[cell] = best;
  }
  return d;
}

export { MAX_COL };
