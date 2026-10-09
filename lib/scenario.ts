import {
  MAX_COL,
  MIN_COL,
  columnOf,
  endTokenCellIds,
  isValidCellId,
  isValidStormColumn,
  parseCell,
  sortCellIds,
} from "./board";
import { MAX_STORMS, PIECE_LIMITS, TOOL_INFO, type PieceKind, type TokenKind, type Tool } from "./tokens";

/** A scenario layout, in the same terms the scenario book uses. */
export interface Layout {
  start: string | null;
  /** The point of the End chevron, e.g. "D11" for C10/E10/D11. */
  end: string | null;
  islands: string[];
  kraken: string[];
  /** Columns with a storm (top + bottom cloud), ascending. */
  storms: number[];
  whirlpools: string[];
  allies: string[];
  crowsNests: string[];
}

export const PIECE_FIELD: Record<PieceKind, keyof Pick<Layout, "islands" | "kraken" | "whirlpools" | "allies" | "crowsNests">> = {
  island: "islands",
  kraken: "kraken",
  whirlpool: "whirlpools",
  ally: "allies",
  crowsNest: "crowsNests",
};

const PIECES = Object.keys(PIECE_FIELD) as PieceKind[];

export function emptyLayout(): Layout {
  return {
    start: "D1",
    end: null,
    islands: [],
    kraken: [],
    storms: [],
    whirlpools: [],
    allies: [],
    crowsNests: [],
  };
}

export function cloneLayout(l: Layout): Layout {
  return {
    ...l,
    islands: [...l.islands],
    kraken: [...l.kraken],
    storms: [...l.storms],
    whirlpools: [...l.whirlpools],
    allies: [...l.allies],
    crowsNests: [...l.crowsNests],
  };
}

export function usesExpansion(l: Layout): boolean {
  return l.whirlpools.length + l.allies.length + l.crowsNests.length > 0;
}

/** Which token covers each space. */
export function occupancy(l: Layout): Map<string, TokenKind> {
  const map = new Map<string, TokenKind>();
  if (l.start) map.set(l.start, "start");
  if (l.end) for (const id of endTokenCellIds(l.end)) map.set(id, "end");
  for (const kind of PIECES) for (const id of l[PIECE_FIELD[kind]]) map.set(id, kind);
  return map;
}

export function pieceCount(l: Layout, kind: PieceKind): number {
  return l[PIECE_FIELD[kind]].length;
}

export function remaining(l: Layout, kind: PieceKind): number {
  return PIECE_LIMITS[kind] - pieceCount(l, kind);
}

function withoutCell(l: Layout, id: string): Layout {
  const next = cloneLayout(l);
  for (const kind of PIECES) {
    const field = PIECE_FIELD[kind];
    next[field] = next[field].filter((x) => x !== id);
  }
  return next;
}

export interface ToolResult {
  layout: Layout;
  changed: boolean;
  message?: string;
}

/** Cells a tool would cover if used on `id` (for hover previews). */
export function footprint(tool: Tool, id: string): string[] {
  if (tool === "end") return endTokenCellIds(id);
  return parseCell(id) ? [id] : [];
}

/**
 * Apply an editor tool to one board space. Pure: returns a new layout.
 *  - Islands, krakens and expansion pieces toggle, and replace each other.
 *  - Start and End never overwrite other tokens, so nothing disappears by accident.
 *  - The storm tool toggles a storm on the space's column.
 */
export function applyTool(l: Layout, tool: Tool, id: string): ToolResult {
  const pos = parseCell(id);
  if (!pos) return { layout: l, changed: false };
  const occ = occupancy(l);
  const here = occ.get(id);

  if (tool === "erase") {
    if (!here) return { layout: l, changed: false };
    if (here === "start") return { layout: { ...cloneLayout(l), start: null }, changed: true };
    if (here === "end") return { layout: { ...cloneLayout(l), end: null }, changed: true };
    return { layout: withoutCell(l, id), changed: true };
  }

  if (tool === "storm") return toggleStorm(l, pos.c);

  if (tool === "start") {
    if (l.start === id) return { layout: l, changed: false };
    if (here) return blocked(l, `${id} already holds ${article(here)}. Remove it first.`);
    return { layout: { ...cloneLayout(l), start: id }, changed: true };
  }

  if (tool === "end") {
    const cells = endTokenCellIds(id);
    if (cells.length === 0) {
      return blocked(l, `The End token covers three spaces and doesn't fit with its point on ${id}.`);
    }
    if (l.end === id) return { layout: l, changed: false };
    for (const cell of cells) {
      const kind = occ.get(cell);
      if (kind && kind !== "end") return blocked(l, `The End token would cover ${cell}, which holds ${article(kind)}.`);
    }
    return { layout: { ...cloneLayout(l), end: id }, changed: true };
  }

  // Single-space pieces
  const kind = tool;
  if (here === kind) return { layout: withoutCell(l, id), changed: true };
  if (here === "start" || here === "end") {
    return blocked(l, `${id} is covered by the ${TOOL_INFO[here].label} token.`);
  }
  if (remaining(l, kind) <= 0) {
    return blocked(
      l,
      `All ${PIECE_LIMITS[kind]} ${TOOL_INFO[kind].plural.toLowerCase()} from the box are on the board. Remove one first.`,
    );
  }
  const next = withoutCell(l, id);
  next[PIECE_FIELD[kind]] = sortCellIds([...next[PIECE_FIELD[kind]], id]);
  return { layout: next, changed: true };
}

export function toggleStorm(l: Layout, col: number): ToolResult {
  if (!isValidStormColumn(col)) return { layout: l, changed: false };
  if (l.storms.includes(col)) {
    return { layout: { ...cloneLayout(l), storms: l.storms.filter((c) => c !== col) }, changed: true };
  }
  if (l.storms.length >= MAX_STORMS) {
    return blocked(l, `The box has 4 storm clouds, enough for ${MAX_STORMS} storms. Remove a storm first.`);
  }
  return {
    layout: { ...cloneLayout(l), storms: [...l.storms, col].sort((a, b) => a - b) },
    changed: true,
  };
}

function blocked(l: Layout, message: string): ToolResult {
  return { layout: l, changed: false, message };
}

function article(kind: TokenKind): string {
  const label = TOOL_INFO[kind].label;
  if (kind === "start" || kind === "end") return `the ${label} token`;
  return /^[aeiou]/i.test(label) ? `an ${label.toLowerCase()}` : `a ${label.toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* Strict parsing for untrusted input (API, URLs)                      */
/* ------------------------------------------------------------------ */

export interface ParseResult {
  layout: Layout;
  problems: string[];
}

/**
 * Turn untrusted JSON into a layout and list every rule it breaks:
 * unknown spaces, overlaps, and more tokens than the box contains.
 */
export function parseLayout(input: unknown): ParseResult {
  const problems: string[] = [];
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const layout = emptyLayout();
  layout.start = null;

  const cellOrNull = (v: unknown, name: string): string | null => {
    if (v === null || v === undefined || v === "") return null;
    if (isValidCellId(v)) return v;
    problems.push(`${name} is not a space on the board.`);
    return null;
  };

  layout.start = cellOrNull(obj.start, "Start");
  const end = cellOrNull(obj.end, "End");
  if (end && endTokenCellIds(end).length === 0) {
    problems.push(`The End token doesn't fit with its point on ${end}.`);
  } else {
    layout.end = end;
  }

  for (const kind of PIECES) {
    const field = PIECE_FIELD[kind];
    const raw = obj[field];
    if (raw === undefined) continue;
    if (!Array.isArray(raw)) {
      problems.push(`${TOOL_INFO[kind].plural} must be a list of spaces.`);
      continue;
    }
    const ids = new Set<string>();
    for (const v of raw) {
      if (isValidCellId(v)) ids.add(v);
      else problems.push(`${TOOL_INFO[kind].label} at "${String(v).slice(0, 8)}" is not a space on the board.`);
    }
    if (ids.size > PIECE_LIMITS[kind]) {
      problems.push(`The box has only ${PIECE_LIMITS[kind]} ${TOOL_INFO[kind].plural.toLowerCase()} (got ${ids.size}).`);
    }
    layout[field] = sortCellIds(ids);
  }

  if (obj.storms !== undefined) {
    if (!Array.isArray(obj.storms)) problems.push("Storms must be a list of columns.");
    else {
      const cols = new Set<number>();
      for (const v of obj.storms) {
        if (isValidStormColumn(v)) cols.add(v);
        else problems.push(`Storm column "${String(v).slice(0, 4)}" is not between ${MIN_COL} and ${MAX_COL}.`);
      }
      if (cols.size > MAX_STORMS) problems.push(`The box has storm clouds for only ${MAX_STORMS} storms.`);
      layout.storms = [...cols].sort((a, b) => a - b);
    }
  }

  // Overlaps
  const seen = new Map<string, string>();
  const claim = (id: string, label: string) => {
    const prev = seen.get(id);
    if (prev) problems.push(`${id} holds both ${prev} and ${label}.`);
    else seen.set(id, label);
  };
  if (layout.start) claim(layout.start, "the Start token");
  if (layout.end) for (const id of endTokenCellIds(layout.end)) claim(id, "the End token");
  for (const kind of PIECES) for (const id of layout[PIECE_FIELD[kind]]) claim(id, `a ${TOOL_INFO[kind].label.toLowerCase()}`);

  return { layout, problems };
}

/* ------------------------------------------------------------------ */
/* Share links: readable coordinates in the query string               */
/*   ?s=D1&e=D11&i=D3.A8.G8&k=A4.G6&w=5&t=My+scenario                  */
/* ------------------------------------------------------------------ */

const PARAM_FIELDS: [string, keyof Layout][] = [
  ["i", "islands"],
  ["k", "kraken"],
  ["wp", "whirlpools"],
  ["al", "allies"],
  ["cn", "crowsNests"],
];

export function layoutToSearchParams(l: Layout, title?: string): URLSearchParams {
  const p = new URLSearchParams();
  if (title?.trim()) p.set("t", title.trim());
  if (l.start) p.set("s", l.start);
  if (l.end) p.set("e", l.end);
  for (const [key, field] of PARAM_FIELDS) {
    const v = l[field] as string[];
    if (v.length) p.set(key, v.join("."));
  }
  if (l.storms.length) p.set("w", l.storms.join("."));
  return p;
}

export function hasLayoutParams(p: URLSearchParams): boolean {
  return ["s", "e", "i", "k", "w", "wp", "al", "cn"].some((k) => p.has(k));
}

export function layoutFromSearchParams(p: URLSearchParams): { layout: Layout; title: string; problems: string[] } {
  const split = (key: string) => (p.get(key) ?? "").split(".").map((x) => x.trim().toUpperCase()).filter(Boolean);
  const raw: Record<string, unknown> = {
    start: p.get("s")?.toUpperCase() ?? null,
    end: p.get("e")?.toUpperCase() ?? null,
    storms: split("w").map(Number),
  };
  for (const [key, field] of PARAM_FIELDS) raw[field] = split(key);
  const { layout, problems } = parseLayout(raw);
  return { layout: dropConflicts(layout), title: (p.get("t") ?? "").slice(0, 60), problems };
}

/** Keep the first claim on any space and trim to the box's limits. */
export function dropConflicts(l: Layout): Layout {
  const next = emptyLayout();
  next.start = l.start;
  const taken = new Set<string>(l.start ? [l.start] : []);
  const endCells = l.end ? endTokenCellIds(l.end) : [];
  if (endCells.length && endCells.every((c) => !taken.has(c))) {
    next.end = l.end;
    endCells.forEach((c) => taken.add(c));
  }
  for (const kind of PIECES) {
    const field = PIECE_FIELD[kind];
    next[field] = l[field].filter((id) => !taken.has(id)).slice(0, PIECE_LIMITS[kind]);
    next[field].forEach((id) => taken.add(id));
  }
  next.storms = [...new Set(l.storms)].filter(isValidStormColumn).sort((a, b) => a - b).slice(0, MAX_STORMS);
  return next;
}

/* ------------------------------------------------------------------ */
/* Scenario-book legend                                                */
/* ------------------------------------------------------------------ */

export interface LegendRow {
  kind: TokenKind | "storm";
  heading: string;
  value: string;
}

export function legendRows(l: Layout): LegendRow[] {
  const rows: LegendRow[] = [
    { kind: "start", heading: "Start", value: l.start ?? "—" },
    { kind: "island", heading: "Island", value: l.islands.join(", ") || "—" },
    { kind: "kraken", heading: "Kraken", value: l.kraken.join(", ") || "—" },
    { kind: "end", heading: "End", value: l.end ? sortCellIds(endTokenCellIds(l.end)).join(", ") : "—" },
  ];
  if (l.whirlpools.length) rows.push({ kind: "whirlpool", heading: "Whirlpool", value: l.whirlpools.join(", ") });
  if (l.allies.length) rows.push({ kind: "ally", heading: "Ally ship", value: l.allies.join(", ") });
  if (l.crowsNests.length) rows.push({ kind: "crowsNest", heading: "Crow's nest", value: l.crowsNests.join(", ") });
  return rows;
}

export function stormText(l: Layout): string {
  if (l.storms.length === 0) return "None";
  if (l.storms.length === 1) return `Column ${l.storms[0]}`;
  return `Column ${l.storms[0]} and ${l.storms[1]}`;
}

export function endColumn(l: Layout): number | null {
  return l.end ? columnOf(l.end) : null;
}
