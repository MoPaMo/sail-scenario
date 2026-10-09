/**
 * Token inventory, from the component lists:
 *  - Sail base game (Allplay rulebook): 26 tokens — 1 Start, 1 End, 12 Island,
 *    9 Kraken, 4 Storm. Storm tokens are used in pairs (one cloud above and one
 *    below the board), so a scenario can have at most 2 storms.
 *  - Sail: Seafarers expansion: 2 Whirlpool, 2 Ally Ship, 2 Crow's Nest.
 */

export type PieceKind = "island" | "kraken" | "whirlpool" | "ally" | "crowsNest";
export type TokenKind = "start" | "end" | PieceKind;
export type Tool = TokenKind | "storm" | "erase";

export const STORM_TOKENS = 4;
export const MAX_STORMS = STORM_TOKENS / 2;

export const PIECE_LIMITS: Record<PieceKind, number> = {
  island: 12,
  kraken: 9,
  whirlpool: 2,
  ally: 2,
  crowsNest: 2,
};

export const BASE_PIECES: PieceKind[] = ["island", "kraken"];
export const EXPANSION_PIECES: PieceKind[] = ["whirlpool", "ally", "crowsNest"];

export interface ToolInfo {
  label: string;
  plural: string;
  /** What the token does at the table, in one plain sentence. */
  rule: string;
  shortcut: string;
  source: "base" | "seafarers" | "editor";
}

export const TOOL_INFO: Record<Tool, ToolInfo> = {
  start: {
    label: "Start",
    plural: "Start",
    rule: "The ship begins here.",
    shortcut: "1",
    source: "base",
  },
  end: {
    label: "End",
    plural: "End",
    rule: "Covers three spaces. Sail onto any of them to win immediately.",
    shortcut: "2",
    source: "base",
  },
  island: {
    label: "Island",
    plural: "Islands",
    rule: "The ship can't enter. A move onto an island doesn't happen.",
    shortcut: "3",
    source: "base",
  },
  kraken: {
    label: "Kraken",
    plural: "Krakens",
    rule: "Entering this space makes the Kraken damage the ship.",
    shortcut: "4",
    source: "base",
  },
  storm: {
    label: "Storm",
    plural: "Storms",
    rule: "Placed on a column. Be fully past the first by the end of round 2, the second by the end of round 4.",
    shortcut: "5",
    source: "base",
  },
  whirlpool: {
    label: "Whirlpool",
    plural: "Whirlpools",
    rule: "Seafarers expansion hazard. Effect per the expansion rulesheet.",
    shortcut: "6",
    source: "seafarers",
  },
  ally: {
    label: "Ally ship",
    plural: "Ally ships",
    rule: "Seafarers expansion token. Effect per the expansion rulesheet.",
    shortcut: "7",
    source: "seafarers",
  },
  crowsNest: {
    label: "Crow's nest",
    plural: "Crow's nests",
    rule: "Seafarers expansion token. Effect per the expansion rulesheet.",
    shortcut: "8",
    source: "seafarers",
  },
  erase: {
    label: "Remove",
    plural: "Remove",
    rule: "Take a token off the board.",
    shortcut: "0",
    source: "editor",
  },
};
