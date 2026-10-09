/**
 * Geometry of the Sail ocean board.
 *
 * The board is a lattice of diamonds: rows A–G, columns 1–25. A space exists
 * only where row index + column is even (A4, B3, C4, D1, …), and both ends of
 * the board taper to a single point (D1 on the left, D25 on the right), which
 * gives 79 spaces in total. Verified against the official scenario book.
 */

export const ROWS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type RowLetter = (typeof ROWS)[number];

export const MIN_COL = 1;
export const MAX_COL = 25;
export const ROW_COUNT = ROWS.length;
const CENTER_ROW = 3; // D

export interface CellPos {
  r: number; // 0 = A … 6 = G
  c: number; // 1 … 25
}

export function isOnBoard(r: number, c: number): boolean {
  if (!Number.isInteger(r) || !Number.isInteger(c)) return false;
  if (r < 0 || r >= ROW_COUNT || c < MIN_COL || c > MAX_COL) return false;
  if ((r + c) % 2 !== 0) return false;
  const offCenter = Math.abs(r - CENTER_ROW);
  return offCenter <= c - MIN_COL && offCenter <= MAX_COL - c;
}

export function cellId(r: number, c: number): string {
  return `${ROWS[r]}${c}`;
}

const CELL_RE = /^([A-Ga-g])(\d{1,2})$/;

export function parseCell(id: string): CellPos | null {
  const m = CELL_RE.exec(id.trim());
  if (!m) return null;
  const r = ROWS.indexOf(m[1].toUpperCase() as RowLetter);
  const c = Number(m[2]);
  return isOnBoard(r, c) ? { r, c } : null;
}

export function isValidCellId(id: unknown): id is string {
  return typeof id === "string" && parseCell(id) !== null && id === id.toUpperCase();
}

/** Column first, then row — the order the scenario book uses (D3, A8, G8, A10 …). */
export function compareCellIds(a: string, b: string): number {
  const pa = parseCell(a);
  const pb = parseCell(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa.c - pb.c || pa.r - pb.r;
}

export function sortCellIds(ids: Iterable<string>): string[] {
  return [...ids].sort(compareCellIds);
}

export const ALL_CELLS: readonly CellPos[] = (() => {
  const cells: CellPos[] = [];
  for (let c = MIN_COL; c <= MAX_COL; c++) {
    for (let r = 0; r < ROW_COUNT; r++) {
      if (isOnBoard(r, c)) cells.push({ r, c });
    }
  }
  return cells;
})();

export const ALL_CELL_IDS: readonly string[] = ALL_CELLS.map((p) => cellId(p.r, p.c));

export type MoveKind = "towardsTop" | "towardsBottom" | "straight";

/**
 * Every move in Sail goes forward (towards higher columns):
 *  - helm pairs and helm cannon flips move one step diagonally, towards the
 *    player who won the trick (top player = row A side, bottom = row G side);
 *  - a fish-tail pair moves straight forward one space (two columns).
 */
export function forwardMoves(p: CellPos): { to: CellPos; kind: MoveKind }[] {
  return [
    { to: { r: p.r - 1, c: p.c + 1 }, kind: "towardsTop" as const },
    { to: { r: p.r + 1, c: p.c + 1 }, kind: "towardsBottom" as const },
    { to: { r: p.r, c: p.c + 2 }, kind: "straight" as const },
  ].filter((m) => isOnBoard(m.to.r, m.to.c));
}

/**
 * The End token is a chevron covering three spaces. We identify it by its
 * point (the right-most space): point D11 covers C10, E10 and D11.
 */
export function endTokenCells(tip: CellPos): CellPos[] {
  return [
    { r: tip.r - 1, c: tip.c - 1 },
    { r: tip.r + 1, c: tip.c - 1 },
    { r: tip.r, c: tip.c },
  ];
}

export function isValidEndTip(tip: CellPos): boolean {
  return endTokenCells(tip).every((p) => isOnBoard(p.r, p.c));
}

export function endTokenCellIds(tipId: string): string[] {
  const tip = parseCell(tipId);
  if (!tip || !isValidEndTip(tip)) return [];
  return endTokenCells(tip).map((p) => cellId(p.r, p.c));
}

/** Storm clouds sit above and below a column; the ship must end up strictly past it. */
export function isValidStormColumn(col: unknown): col is number {
  return typeof col === "number" && Number.isInteger(col) && col >= MIN_COL && col <= MAX_COL;
}

export function columnOf(id: string): number {
  return parseCell(id)?.c ?? NaN;
}
