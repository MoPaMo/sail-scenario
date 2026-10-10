import { boardFromLayout } from "./game/geometry";
import { hashString } from "./game/rng";
import { simulate, type SimResult } from "./game/simulate";
import type { Layout } from "./scenario";

/**
 * Difficulty estimate: simulated games of the scenario, compared with the
 * printed scenarios run the same way. Seeded from the layout, so the same
 * layout always gets the same numbers (in the editor, on the server, in tests).
 */

export const DIFFICULTY_GAMES = 400;

export function layoutSignature(l: Layout): string {
  const s = (a: string[]) => [...a].sort().join(",");
  return [l.start, l.end, s(l.islands), s(l.kraken), [...l.storms].sort((a, b) => a - b).join(","), s(l.whirlpools), s(l.allies), s(l.crowsNests)].join("|");
}

export function estimateDifficulty(l: Layout, onProgress?: (partial: SimResult) => void): SimResult | null {
  const b = boardFromLayout(l);
  if (!b) return null;
  return simulate(b, { games: DIFFICULTY_GAMES, seed: hashString(layoutSignature(l)), onProgress, progressEvery: 50 });
}
